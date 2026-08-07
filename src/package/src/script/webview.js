// Main browser-side controller for the visualizer.
// It coordinates Q# results, WebGPU buffers, canvas fallback drawing, tabs,
// animation, pointer interaction, and the per-qubit Bloch cards.
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const canvas = document.querySelector('canvas');
const statusText = document.querySelector('#status');
const qsphereContainer = document.getElementById('container');
const controlsContainer = document.getElementById('controls');
let rotationAngles = [0.3, 0.0, 0.0];
let currentMode = 'bloch';
let lastParsedResult = null;
let selectedQubitIndex = 0;
let selectedQubitName = null;
let currentQubitsList = [];
let miniRenderers = [];
const qubitSphereSize = 270;
let qsphereHoverInfo = null;

// Compare vectors with a small tolerance so animation can settle cleanly despite
// floating-point interpolation noise.
function vectorsClose(a, b, epsilon = 1e-3) {
    return Math.abs(a[0] - b[0]) < epsilon
        && Math.abs(a[1] - b[1]) < epsilon
        && Math.abs(a[2] - b[2]) < epsilon;
}

// Build the DOM wrapper used by each mini Bloch canvas. Labels live in the same
// stage so their projected positions track the sphere during rotation.
function createQubitSphereStage(card, canvasElement) {
    const stage = document.createElement('div');
    stage.className = 'qubit-sphere-stage';

    const labels = document.createElement('div');
    labels.className = 'qubit-bloch-labels';
    const labelNames = [
        ['zero', '|0⟩'], ['one', '|1⟩'], ['plus', '|+⟩'],
        ['minus', '|-⟩'], ['i-plus', '|+i⟩'], ['i-minus', '|-i⟩']
    ];
    for (const [name, text] of labelNames) {
        const label = document.createElement('div');
        label.className = `qubit-bloch-label label-${name}`;
        label.textContent = text;
        labels.appendChild(label);
    }

    stage.appendChild(canvasElement);
    stage.appendChild(labels);
    card.appendChild(stage);
    return { stage, labels };
}

function setStatus(message) {
    if (statusText) statusText.textContent = '';
}

// Paint the phase key with the same phaseToRgb mapping used by Q-sphere nodes.
function drawPhaseLegend() {
    const legendCanvas = document.getElementById('qsphere-phase-wheel');
    if (!legendCanvas || typeof phaseToRgb !== 'function') return;

    const context = legendCanvas.getContext('2d');
    if (!context) return;

    const center = legendCanvas.width / 2;
    const outerRadius = center - 4;
    const innerRadius = outerRadius - 10;
    const segments = 24;

    context.clearRect(0, 0, legendCanvas.width, legendCanvas.height);
    for (let index = 0; index < segments; index++) {
        const start = (index / segments) * Math.PI * 2;
        const end = ((index + 1) / segments) * Math.PI * 2;
        const phase = -((start + end) / 2);
        const [r, g, b] = phaseToRgb(phase);
        context.beginPath();
        context.arc(center, center, outerRadius, start, end);
        context.arc(center, center, innerRadius, end, start, true);
        context.closePath();
        context.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        context.fill();
    }

    context.beginPath();
    context.arc(center, center, innerRadius - 1, 0, Math.PI * 2);
    context.fillStyle = '#12303a';
    context.fill();
    context.strokeStyle = 'rgba(230, 230, 238, 0.35)';
    context.lineWidth = 1;
    context.stroke();
}

// Keep tab state in both the DOM and a body data attribute so CSS can enforce the
// active view even while JavaScript is replacing/reinserting the main container.
function updateModeTabs() {
    document.body.dataset.visualizationMode = currentMode;
    document.querySelectorAll('.view-tab').forEach(tab => {
        const isActive = tab.dataset.viewMode === currentMode;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
    });
}

function getQsphereHoverInfo() {
    if (qsphereHoverInfo || !qsphereContainer) return qsphereHoverInfo;

    qsphereHoverInfo = document.createElement('div');
    qsphereHoverInfo.className = 'qubit-hover-info qsphere-hover-info';
    qsphereHoverInfo.hidden = true;
    qsphereContainer.appendChild(qsphereHoverInfo);
    return qsphereHoverInfo;
}

function formatBasisState(index, qubits) {
    return `|${index.toString(2).padStart(qubits, '0')}>`;
}

function formatPhasePi(phase) {
    const twoPi = Math.PI * 2;
    const normalized = ((phase % twoPi) + twoPi) % twoPi;
    const units = normalized / Math.PI;
    const known = [
        [0, '0'],
        [0.5, 'pi/2'],
        [1, 'pi'],
        [1.5, '3pi/2'],
        [2, '0']
    ];

    for (const [value, label] of known) {
        if (Math.abs(units - value) < 0.03) return label;
    }
    return `${units.toFixed(2)}pi`;
}

function updateQsphereBuffers(qs, rebuildLabels = true) {
    if (!webgpuState || !qs) return;

    const nodeVerts = qs.nodeVertices;
    if (nodeVerts.byteLength <= webgpuState.qnodeVertexBuffer.size) {
        webgpuState.device.queue.writeBuffer(webgpuState.qnodeVertexBuffer, 0, nodeVerts);
        webgpuState.qnodeVertexCount = nodeVerts.length / 7;
    }

    const lineVerts = qs.lineVertices || qs.ringVertices;
    if (lineVerts.byteLength <= webgpuState.qsphereLineVertexBuffer.size) {
        webgpuState.device.queue.writeBuffer(webgpuState.qsphereLineVertexBuffer, 0, lineVerts);
        webgpuState.qsphereLineVertexCount = lineVerts.length / 6;
    }
    const spokeVerts = qs.spokeVertices || new Float32Array(0);
    if (spokeVerts.byteLength <= webgpuState.qsphereSpokeVertexBuffer.size) {
        webgpuState.device.queue.writeBuffer(webgpuState.qsphereSpokeVertexBuffer, 0, spokeVerts);
        webgpuState.qsphereSpokeVertexCount = spokeVerts.length / 7;
    }
    webgpuState.qsphereData = qs;
    if (rebuildLabels) rebuildQsphereLabels(qs.points, qs.N);
}

// Copy the latest Q-sphere geometry into dedicated GPU buffers. Q-sphere rings
// must stay separate from the Bloch line buffer used by mini renderers.
function updateQsphereState(result, options = {}) {
    if (!webgpuState || !result) return;

    const qs = computeQsphere(result, {
        focusedIndex: webgpuState.qsphereHoveredIndex
    });
    updateQsphereBuffers(qs, options.rebuildLabels !== false);
}

function setQsphereHoveredIndex(index) {
    if (!webgpuState || webgpuState.qsphereHoveredIndex === index) return;

    webgpuState.qsphereHoveredIndex = index;
    if (lastParsedResult) updateQsphereState(lastParsedResult, { rebuildLabels: false });
}

function clearQsphereHover() {
    setQsphereHoveredIndex(null);
    if (qsphereHoverInfo) qsphereHoverInfo.hidden = true;
}

function updateQsphereHover(event) {
    if (!webgpuState || currentMode !== 'qsphere' || isDragging) {
        clearQsphereHover();
        return;
    }

    const hoverInfo = getQsphereHoverInfo();
    const qsphereData = webgpuState.qsphereData;
    if (!hoverInfo || !qsphereData?.hoverTargets?.length) return;

    const rect = canvas.getBoundingClientRect();
    const width = qsphereContainer.clientWidth;
    const height = qsphereContainer.clientHeight;
    const point = [event.clientX - rect.left, event.clientY - rect.top];
    const modelMatrix = rotateMatrix(...rotationAngles, webgpuState.projMatrix);
    const center = projectPoint([0, 0, 0], modelMatrix, width, height);

    let best = null;
    for (const target of qsphereData.hoverTargets) {
        const projected = projectPoint(target.pos, modelMatrix, width, height);
        if (!projected) continue;

        const nodeDistance = Math.hypot(point[0] - projected[0], point[1] - projected[1]);
        const nodeHitRadius = Math.max(9, 10 + target.radius * 125);
        const centerDistance = center ? Math.hypot(point[0] - center[0], point[1] - center[1]) : 0;
        const spokeDistance = center ? distanceToSegment(point, center, projected) : Number.POSITIVE_INFINITY;
        const isNodeHit = nodeDistance <= nodeHitRadius;
        const isSpokeHit = centerDistance > 14 && spokeDistance <= 9;
        const hitDistance = isNodeHit ? nodeDistance : spokeDistance;
        const hitThreshold = isNodeHit ? nodeHitRadius : 9;

        if ((isNodeHit || isSpokeHit) && hitDistance <= hitThreshold && (!best || hitDistance < best.distance)) {
            best = { target, projected, distance: hitDistance };
        }
    }

    if (!best) {
        clearQsphereHover();
        return;
    }

    setQsphereHoveredIndex(best.target.index);

    const phaseDegrees = (((best.target.phase * 180 / Math.PI) % 360) + 360) % 360;
    hoverInfo.innerHTML =
        `${formatBasisState(best.target.index, qsphereData.N)}<br>` +
        `Probability: ${(best.target.probability * 100).toFixed(1)}%<br>` +
        `Phase: ${phaseDegrees.toFixed(1)} deg (${formatPhasePi(best.target.phase)})`;
    hoverInfo.style.left = `${Math.min(width - 8, Math.max(8, point[0] + 12))}px`;
    hoverInfo.style.top = `${Math.min(height - 8, Math.max(8, point[1] + 12))}px`;
    hoverInfo.hidden = false;
}

// Switch views, refresh visibility, and render the already parsed state immediately.
function setVisualizationMode(mode) {
    if (mode !== 'bloch' && mode !== 'qsphere') return;
    clearQsphereHover();
    currentMode = mode;
    updateModeTabs();

    updateVisibility(lastParsedResult?.qubitsDeclared || 0);
    if (lastParsedResult && currentMode === 'qsphere') {
        resizeCanvas();
        if (webgpuState) webgpuState.projMatrix = webgpuState.buildProjMatrix();
        updateQsphereState(lastParsedResult);
    }

    if (webgpuState) render(webgpuState);
}

document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => setVisualizationMode(tab.dataset.viewMode));
});
updateModeTabs();
drawPhaseLegend();

// Fetch a WGSL shader as text so it can be compiled into a WebGPU shader module.
async function loadShader(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${path}`);
    }

    return response.text();
}

// Match the backing canvas resolution to its CSS size and device pixel ratio.
function resizeCanvas() {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

let pendingCode = null;
let fallbackMode = false;

// Position labels when WebGPU is unavailable. This simple 2D fallback keeps the
// visualizer usable on systems without WebGPU support.
function positionFallbackLabels() {
    const positions = {
        'label-zero': [0.5, 0.02],
        'label-one': [0.5, 0.98],
        'label-plus': [0.98, 0.5],
        'label-minus': [0.02, 0.5],
        'label-i-plus': [0.5, 0.76],
        'label-i-minus': [0.5, 0.24]
    };
    const rect = canvas.getBoundingClientRect();
    for (const [id, [x, y]] of Object.entries(positions)) {
        const label = document.getElementById(id);
        if (!label) continue;
        label.style.display = 'block';
        label.style.transform = `translate(-50%, -50%) translate(${rect.width * x}px, ${rect.height * y}px)`;
    }
}

// Draw a minimal full-size Bloch sphere and arrow with Canvas 2D.
function drawFallbackBloch(screenVector) {
    resizeCanvas();
    const context = canvas.getContext('2d');
    if (!context) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.38;
    const [x, y] = screenVector || [0, 1];

    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.strokeStyle = 'rgba(205, 205, 215, 0.72)';
    context.lineWidth = Math.max(1, width / 320);
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.moveTo(centerX - radius, centerY);
    context.lineTo(centerX + radius, centerY);
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX, centerY + radius);
    context.stroke();

    const tipX = centerX + x * radius;
    const tipY = centerY - y * radius;
    const angle = Math.atan2(tipY - centerY, tipX - centerX);
    context.strokeStyle = '#f0f0f0';
    context.fillStyle = '#f0f0f0';
    context.lineWidth = Math.max(2, width / 150);
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(tipX, tipY);
    context.stroke();
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(tipX - Math.cos(angle - 0.45) * width / 28, tipY - Math.sin(angle - 0.45) * width / 28);
    context.lineTo(tipX - Math.cos(angle + 0.45) * width / 28, tipY - Math.sin(angle + 0.45) * width / 28);
    context.closePath();
    context.fill();

    positionFallbackLabels();
}

// Convert the latest Q# result into the fallback arrow representation.
function drawFallbackResult(result, targetQubit = 0) {
    const arrowResult = computeBlochArrow(result, targetQubit);
    drawFallbackBloch(arrowResult.screenVector);
}

// Draw one compact Bloch sphere for the fallback version of a qubit card.
function drawMiniBlochSphere(canvasElement, screenVector, label) {
    const context = canvasElement.getContext('2d');
    if (!context) return;

    const width = Math.max(72, canvasElement.width || 96);
    const height = Math.max(72, canvasElement.height || 96);
    canvasElement.width = width;
    canvasElement.height = height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.32;
    const [x, y, z] = screenVector || [0, 1, 0];

    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.save();
    context.translate(centerX + 2, centerY + 5);
    context.beginPath();
    context.ellipse(0, 0, radius * 0.96, radius * 0.74, 0, 0, Math.PI * 2);
    context.fillStyle = 'rgba(0, 0, 0, 0.18)';
    context.fill();
    context.restore();

    const sphereGradient = context.createRadialGradient(
        centerX - radius * 0.28,
        centerY - radius * 0.32,
        radius * 0.1,
        centerX,
        centerY,
        radius
    );
    sphereGradient.addColorStop(0, '#f8f8ff');
    sphereGradient.addColorStop(0.45, '#a9bde7');
    sphereGradient.addColorStop(1, '#4a63a8');

    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = sphereGradient;
    context.fill();

    context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    context.lineWidth = 1.2;
    context.stroke();

    context.beginPath();
    context.arc(centerX - radius * 0.24, centerY - radius * 0.24, radius * 0.24, 0.2, 2.1);
    context.strokeStyle = 'rgba(255, 255, 255, 0.34)';
    context.lineWidth = 1.3;
    context.stroke();

    const tipX = centerX + x * radius * 0.78;
    const tipY = centerY - z * radius * 0.78;
    const angle = Math.atan2(tipY - centerY, tipX - centerX);
    context.strokeStyle = '#f8f9ff';
    context.fillStyle = '#f8f9ff';
    context.lineWidth = 1.7;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(tipX, tipY);
    context.stroke();
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(tipX - Math.cos(angle - 0.48) * width / 18, tipY - Math.sin(angle - 0.48) * width / 18);
    context.lineTo(tipX - Math.cos(angle + 0.48) * width / 18, tipY - Math.sin(angle + 0.48) * width / 18);
    context.closePath();
    context.fill();

    context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    context.lineWidth = 0.9;
    context.beginPath();
    context.moveTo(centerX - radius * 0.68, centerY);
    context.lineTo(centerX + radius * 0.68, centerY);
    context.moveTo(centerX, centerY - radius * 0.68);
    context.lineTo(centerX, centerY + radius * 0.68);
    context.stroke();

    context.fillStyle = '#d9d9e3';
    context.font = '10px sans-serif';
    context.textAlign = 'center';
    context.fillText(label || '', centerX, height - 8);
}

// Create the visible Bloch card DOM for every declared qubit. WebGPU renderers
// are attached afterward, while fallback mode paints each canvas immediately.
function renderQubitColumn(result) {
    const column = document.getElementById('qubit-column');
    if (!column) return;

    const qubitsList = result?.qubitsList || [];
    const count = Math.max(qubitsList.length, result?.qubitsDeclared || 0);
    currentQubitsList = qubitsList;
    column.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'qubit-mini';

        const label = document.createElement('div');
        label.className = 'qubit-mini-label';
        label.textContent = `Qubit ${i}`;

        const canvas = document.createElement('canvas');
        canvas.className = 'qubit-mini-canvas';
        canvas.width = qubitSphereSize;
        canvas.height = qubitSphereSize;

        card.appendChild(label);
        createQubitSphereStage(card, canvas);
        column.appendChild(card);

        const arrowResult = computeBlochArrow(result, i);
        drawMiniBlochSphere(canvas, arrowResult.screenVector, qubitsList[i] || `q${i}`);
    }
}

// Release GPU resources belonging to old mini renderers before rebuilding cards.
function destroyMiniRenderers() {
    for (const renderer of miniRenderers) {
        renderer.uniformBuffer?.destroy();
        renderer.arrowVertexBuffer?.destroy();
    }
    miniRenderers = [];
}

// Create the WebGPU resources and pointer handlers for one qubit card.
async function createMiniRenderer(canvasElement, result, qubitIndex, state, previousVector, previousRotation) {
    const context = canvasElement.getContext('webgpu');
    if (!context) return null;

    const format = state.format;
    context.configure({ device: state.device, format, alphaMode: 'premultiplied' });

    const aspect = canvasElement.width / canvasElement.height;
    const projMatrix = mult(
        createPerspectiveMatrix(Math.PI / 4, aspect, 0.1, 100),
        createTranslationMatrix(0, 0, -3)
    );
    const modelMatrix = rotateMatrix(0.35, -0.65, 0, projMatrix);
    const uniformBuffer = state.device.createBuffer({
        label: `Qubit ${qubitIndex} Uniform Buffer`,
        size: modelMatrix.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    state.device.queue.writeBuffer(uniformBuffer, 0, modelMatrix);

    const bindGroup = state.device.createBindGroup({
        layout: state.bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    const arrowResult = computeBlochArrow(result, qubitIndex);
    const arrowVertices = arrowResult.vertices;
    const stepVectors = arrowResult.stepVectors || [];
    const finalVector = arrowResult.screenVector || [0, 1, 0];
    const currentVector = previousVector || stepVectors[0] || finalVector;
    const targetVector = previousVector ? finalVector : (stepVectors[0] || finalVector);
    const stepQueue = previousVector ? [] : stepVectors.slice(1);
    const arrowVertexBuffer = state.device.createBuffer({
        label: `Qubit ${qubitIndex} Arrow Buffer`,
        size: Math.max(arrowVertices.byteLength, 64 * 1024),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    if (arrowVertices.byteLength > 0) {
        state.device.queue.writeBuffer(arrowVertexBuffer, 0, arrowVertices);
    }

    const rotation = previousRotation ? [...previousRotation] : [0.3, 0.0, 0.0];
    let dragging = false;
    let previousX = 0;
    canvasElement.addEventListener('mousedown', event => {
        dragging = true;
        previousX = event.clientX;
    });
    canvasElement.addEventListener('mousemove', event => {
        if (!dragging) return;
        rotation[1] += (event.clientX - previousX) * 0.005;
        previousX = event.clientX;
    });
    canvasElement.addEventListener('mouseup', () => { dragging = false; });
    canvasElement.addEventListener('mouseleave', () => { dragging = false; });

    const renderer = {
        canvas: canvasElement,
        stage: canvasElement.parentElement,
        labels: [...canvasElement.parentElement.querySelectorAll('.qubit-bloch-label')],
        device: state.device,
        context,
        bindGroup,
        uniformBuffer,
        arrowVertexBuffer,
        arrowVertexCount: arrowVertices.length / 6,
        arrowVector: arrowResult.screenVector,
        currentVector: [...currentVector],
        targetVector: [...targetVector],
        stepQueue,
        projMatrix,
        rotation,
        qubitIndex,
        hoverInfo: null
    };

    try {
        const hoverInfo = document.createElement('div');
        hoverInfo.className = 'qubit-hover-info';
        hoverInfo.hidden = true;
        renderer.stage.appendChild(hoverInfo);
        renderer.hoverInfo = hoverInfo;

        canvasElement.addEventListener('mousemove', event => {
            updateArrowHover(renderer, event);
        });
        canvasElement.addEventListener('mouseleave', () => {
            renderer.hoverInfo.hidden = true;
        });
    } catch (error) {
        console.warn('Arrow hover information unavailable:', error);
    }

    return renderer;
}

// Advance one mini arrow toward its next captured state and submit its render pass.
function renderMiniRenderer(renderer, state) {
    const current = renderer.currentVector;
    const target = renderer.targetVector;
    if (!vectorsClose(current, target)) {
        const nextVector = interpolateVector(current, target, 0.25);
        renderer.currentVector = vectorsClose(nextVector, target) ? [...target] : nextVector;
        const arrowVertices = buildArrowVertices(nextVector);
        if (arrowVertices.byteLength > 0) {
            renderer.device.queue.writeBuffer(renderer.arrowVertexBuffer, 0, arrowVertices);
        }
        renderer.arrowVertexCount = arrowVertices.length / 6;
    } else if (renderer.stepQueue.length > 0) {
        renderer.targetVector = renderer.stepQueue.shift();
    }

    const modelMatrix = rotateMatrix(...renderer.rotation, renderer.projMatrix);
    renderer.device.queue.writeBuffer(renderer.uniformBuffer, 0, modelMatrix);
    updateMiniLabels(renderer, modelMatrix);

    const commandEncoder = renderer.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: renderer.context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store'
        }]
    });

    passEncoder.setBindGroup(0, renderer.bindGroup);
    passEncoder.setPipeline(state.pipeline);
    passEncoder.setVertexBuffer(0, state.vertexBuffer);
    passEncoder.draw(state.vertexCount);

    passEncoder.setPipeline(state.linePipeline);
    passEncoder.setVertexBuffer(0, state.lineVertexBuffer);
    passEncoder.draw(state.lineVertexCount);

    if (renderer.arrowVertexCount > 0) {
        passEncoder.setPipeline(state.arrowPipeline);
        passEncoder.setVertexBuffer(0, renderer.arrowVertexBuffer);
        passEncoder.draw(renderer.arrowVertexCount);
    }

    passEncoder.end();
    renderer.device.queue.submit([commandEncoder.finish()]);
}

// Project the six Bloch basis labels into the mini canvas and hide labels behind
// the camera when their projected point is unavailable.
function updateMiniLabels(renderer, modelMatrix) {
    const width = renderer.stage.clientWidth;
    const height = renderer.stage.clientHeight;
    for (let i = 0; i < blochLabelDefs.length; i++) {
        const label = renderer.labels[i];
        if (!label) continue;
        const point = projectPoint(blochLabelDefs[i].pos, modelMatrix, width, height);
        if (point) {
            label.style.transform = `translate(-50%, -50%) translate(${point[0]}px, ${point[1]}px)`;
            label.style.display = 'block';
        } else {
            label.style.display = 'none';
        }
    }
}

// Upgrade all cards from fallback canvases to independent WebGPU renderers while
// preserving each card's current vector and rotation where possible.
async function renderMiniQubitColumn(result) {
    if (!webgpuState) return;
    const previousVectors = miniRenderers.map(renderer => renderer.currentVector);
    const previousRotations = miniRenderers.map(renderer => renderer.rotation);
    destroyMiniRenderers();
    const canvases = [...document.querySelectorAll('.qubit-mini-canvas')];
    miniRenderers = (await Promise.all(
        canvases.map((canvasElement, index) =>
            createMiniRenderer(
                canvasElement,
                result,
                index,
                webgpuState,
                previousVectors[index],
                previousRotations[index]
            )
        )
    )).filter(Boolean);
}

// Return the shortest distance from a 2D point to a line segment.
function distanceToSegment(point, start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-6) {
        return Math.hypot(point[0] - start[0], point[1] - start[1]);
    }
    const t = Math.max(0, Math.min(1,
        ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
    return Math.hypot(
        point[0] - (start[0] + t * dx),
        point[1] - (start[1] + t * dy)
    );
}

// Display probability and phase information when the pointer is close to the
// projected arrow segment, rather than anywhere inside the canvas.
function updateArrowHover(renderer, event) {
    if (!renderer.hoverInfo) return;

    const width = renderer.stage.clientWidth;
    const height = renderer.stage.clientHeight;
    const rect = renderer.canvas.getBoundingClientRect();
    const point = [event.clientX - rect.left, event.clientY - rect.top];
    const modelMatrix = rotateMatrix(...renderer.rotation, renderer.projMatrix);
    const start = projectPoint([0, 0, 0], modelMatrix, width, height);
    const end = projectPoint(renderer.currentVector, modelMatrix, width, height);

    if (!start || !end || distanceToSegment(point, start, end) > 11) {
        renderer.hoverInfo.hidden = true;
        return;
    }

    const blochX = renderer.currentVector[0];
    const blochY = renderer.currentVector[2];
    const blochZ = renderer.currentVector[1];
    const probabilityZero = Math.max(0, Math.min(1, (1 + blochZ) / 2));
    const probabilityOne = Math.max(0, Math.min(1, (1 - blochZ) / 2));
    const phase = Math.atan2(blochY, blochX) * 180 / Math.PI;
    const phaseText = Math.hypot(blochX, blochY) < 1e-3
        ? 'undefined'
        : `${phase.toFixed(1)}°`;

    renderer.hoverInfo.innerHTML =
        `P(|0⟩): ${(probabilityZero * 100).toFixed(1)}%<br>` +
        `P(|1⟩): ${(probabilityOne * 100).toFixed(1)}%<br>` +
        `Phase: ${phaseText}`;
    renderer.hoverInfo.style.left = `${Math.min(width - 8, Math.max(8, point[0] + 12))}px`;
    renderer.hoverInfo.style.top = `${Math.min(height - 8, Math.max(8, point[1] + 12))}px`;
    renderer.hoverInfo.hidden = false;
}

// Reset every renderer to its first captured vector and queue the remaining frames.
function replayAnimation() {
    if (!lastParsedResult) return;

    for (let index = 0; index < miniRenderers.length; index++) {
        const renderer = miniRenderers[index];
        const arrowResult = computeBlochArrow(lastParsedResult, index);
        const firstVector = arrowResult.stepVectors[0] || arrowResult.screenVector || [0, 1, 0];
        renderer.currentVector = [...firstVector];
        renderer.targetVector = [...firstVector];
        renderer.stepQueue = (arrowResult.stepVectors || []).slice(1);
        const vertices = buildArrowVertices(firstVector);
        renderer.arrowVertexCount = vertices.length / 6;
        if (vertices.byteLength > 0) {
            renderer.device.queue.writeBuffer(renderer.arrowVertexBuffer, 0, vertices);
        }
    }

    if (webgpuState) {
        const firstVector = webgpuState.stepVectors?.[0] || webgpuState.targetVector || [0, 1, 0];
        webgpuState.currentVector = [...firstVector];
        webgpuState.targetVector = [...firstVector];
        webgpuState.stepQueue = (webgpuState.stepVectors || []).slice(1);
        const vertices = buildArrowVertices(firstVector);
        webgpuState.arrowVertexCount = vertices.length / 6;
        if (vertices.byteLength > 0) {
            webgpuState.device.queue.writeBuffer(webgpuState.arrowVertexBuffer, 0, vertices);
        }
    }
}

// Initialize WebGPU, compile all shaders, create pipelines, and allocate buffers
// shared by the full-size Q-sphere and mini Bloch renderers.
async function initWebGPU() {
    let initialArrowData = null;
    let initialQubits = 0;
    const testQsUri = canvas.dataset.testQs || 'test.qs';
    
    if (pendingCode) {
        try {
            const result = await parseQSharp(pendingCode);
            initialArrowData = computeBlochArrow(result);
            initialQubits = result.qubitsDeclared;
        } catch (e) {
            console.warn('Could not parse pending Q# code:', e);
        }
    }

    if (!initialArrowData) {
        try {
            const response = await fetch(testQsUri);
            if (response.ok) {
                const code = await response.text();
                const result = await parseQSharp(code);
                initialArrowData = computeBlochArrow(result);
                initialQubits = result.qubitsDeclared;
            }
        } catch (e) {
            console.warn('Could not fetch initial Q# file:', e);
        }
    }

    if (!initialArrowData) {
        initialArrowData = computeBlochArrow({ operations: [], qubitsDeclared: 0 });
        initialQubits = 0;
    }

    updateVisibility(initialQubits);

    if (!navigator.gpu) {
        fallbackMode = true;
        drawFallbackBloch(initialArrowData.screenVector);
        setStatus('WebGPU is not available; using 2D fallback.');
        return undefined;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        fallbackMode = true;
        drawFallbackBloch(initialArrowData.screenVector);
        setStatus('No WebGPU adapter; using 2D fallback.');
        return undefined;
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();

    const mesh = sphere(32, 32);

    const vertexBuffer = device.createBuffer({
        label: "Vertex Buffer",
        size: mesh.positions.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    const vertexCount = mesh.positions.length / 6;

    device.queue.writeBuffer(vertexBuffer, 0, mesh.positions);

    resizeCanvas();

    function buildProjMatrix() {
        return mult(
            createPerspectiveMatrix(Math.PI / 4, canvas.width / canvas.height, 0.1, 100),
            createTranslationMatrix(0, 0, -3)
        );
    }

    const projMatrix = buildProjMatrix();

    const modelMatrix = rotateMatrix(...rotationAngles, projMatrix);

    const vertexUniformBuffer = device.createBuffer({
        size: modelMatrix.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(vertexUniformBuffer, 0, modelMatrix);

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform',
                },
            },
        ],
    });

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: vertexUniformBuffer,
                },
            },
        ],
    });

    const vertexShaderUri = canvas.dataset.vertexShader || 'shader/vertex.wgsl';
    const fragmentShaderUri = canvas.dataset.fragmentShader || 'shader/fragment.wgsl';
    const arrowShaderUri = canvas.dataset.arrowShader || 'shader/fragment_arrow.wgsl';
    const linesShaderUri = canvas.dataset.linesShader || 'shader/fragment_lines.wgsl';
    const qnodesShaderUri = canvas.dataset.qnodesShader || 'shader/fragment_qnodes.wgsl';
    const qnodesVertexShaderUri = canvas.dataset.qnodesVertexShader || 'shader/qnodes_vertex.wgsl';

    const [vertexShader, fragmentShader, arrowFragShader, linesFragShader, qnodesFragShader, qnodesVertexShader] = await Promise.all([
        loadShader(vertexShaderUri),
        loadShader(fragmentShaderUri),
        loadShader(arrowShaderUri),
        loadShader(linesShaderUri),
        loadShader(qnodesShaderUri),
        loadShader(qnodesVertexShaderUri)
    ]);

    const vertexModule = device.createShaderModule({ code: vertexShader });
    const fragmentModule = device.createShaderModule({ code: fragmentShader });
    const arrowFragModule = device.createShaderModule({ code: arrowFragShader });
    const linesFragModule = device.createShaderModule({ code: linesFragShader });
    const qnodesFragModule = device.createShaderModule({ code: qnodesFragShader });
    const qnodesVertexModule = device.createShaderModule({ code: qnodesVertexShader });


    const vertexBufferLayout = {
        arrayStride: Float32Array.BYTES_PER_ELEMENT * 6,
        attributes: [
            {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3'
            },
            {
                shaderLocation: 1,
                offset: Float32Array.BYTES_PER_ELEMENT * 3,
                format: 'float32x3'
            }
        ]
    };
    const qnodeVertexBufferLayout = {
        arrayStride: Float32Array.BYTES_PER_ELEMENT * 7,
        attributes: [
            {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3'
            },
            {
                shaderLocation: 1,
                offset: Float32Array.BYTES_PER_ELEMENT * 3,
                format: 'float32x4'
            }
        ]
    };

    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
    });


    const blendState = {
        color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
        },
        alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
        },
    };


    const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: fragmentModule,
            entryPoint: 'main',
            targets: [{ format, blend: blendState }]
        },
        primitive: { topology: 'triangle-list' }
    });


    const arrowPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: arrowFragModule,
            entryPoint: 'main',
            targets: [{ format, blend: blendState }]
        },
        primitive: { topology: 'triangle-list' }
    });

    const linePipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: vertexModule,
            entryPoint: 'main',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: linesFragModule,
            entryPoint: 'main',
            targets: [{ format, blend: blendState }]
        },
        primitive: { topology: 'line-list' }
    });

    const qnodePipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: qnodesVertexModule,
            entryPoint: 'main',
            buffers: [qnodeVertexBufferLayout]
        },
        fragment: {
            module: qnodesFragModule,
            entryPoint: 'main',
            targets: [{ format, blend: blendState }]
        },
        primitive: { topology: 'triangle-list' }
    });

    const spokePipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: qnodesVertexModule,
            entryPoint: 'main',
            buffers: [qnodeVertexBufferLayout]
        },
        fragment: {
            module: qnodesFragModule,
            entryPoint: 'main',
            targets: [{ format, blend: blendState }]
        },
        primitive: { topology: 'triangle-list' }
    });

    const lineVertices = buildSphereLines();
    const lineVertexBuffer = device.createBuffer({
        label: 'Line Vertex Buffer',
        size: Math.max(lineVertices.byteLength, 4 * 1024 * 1024),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    const lineVertexCount = lineVertices.length / 6;
    device.queue.writeBuffer(lineVertexBuffer, 0, lineVertices);


    const arrowVertices = initialArrowData.vertices;
    const arrowVertexBuffer = device.createBuffer({
        label: 'Arrow Vertex Buffer',
        size: Math.max(arrowVertices.byteLength, 512 * 1024),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    const arrowVertexCount = arrowVertices.length / 6;
    if (arrowVertices.byteLength > 0) {
        device.queue.writeBuffer(arrowVertexBuffer, 0, arrowVertices);
    }

    const qnodeVertexBuffer = device.createBuffer({
        label: 'QNode Vertex Buffer',
        size: 4 * 1024 * 1024,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    let qnodeVertexCount = 0;

    const qsphereLineVertexBuffer = device.createBuffer({
        label: 'Q-sphere Line Vertex Buffer',
        size: 4 * 1024 * 1024,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    let qsphereLineVertexCount = 0;
    const qsphereSpokeVertexBuffer = device.createBuffer({
        label: 'Q-sphere Spoke Vertex Buffer',
        size: 4 * 1024 * 1024,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    let qsphereSpokeVertexCount = 0;

    resizeCanvas();

    context.configure({
        device,
        format,
        alphaMode: 'premultiplied'
    });

    const initialScreenVec = initialArrowData.screenVector || [0, 1, 0];
    const currentVector = [initialScreenVec[0], initialScreenVec[1], initialScreenVec[2]];
    const targetVector = [initialScreenVec[0], initialScreenVec[1], initialScreenVec[2]];
    const stepVectors = initialArrowData.stepVectors || [];

    return {
        device, context, pipeline, vertexBuffer, vertexCount,
        bindGroup, bindGroupLayout, vertexUniformBuffer, projMatrix, buildProjMatrix, format,
        arrowPipeline, arrowVertexBuffer, arrowVertexCount,
        linePipeline, lineVertexBuffer, lineVertexCount,
        qnodePipeline, qnodeVertexBuffer, qnodeVertexCount,
        spokePipeline, qsphereLineVertexBuffer, qsphereLineVertexCount,
        qsphereSpokeVertexBuffer, qsphereSpokeVertexCount,
        currentVector, targetVector, stepVectors, stepQueue: []
    };
}

// Submit one full-size render pass. Which geometry is drawn depends on the active
// view: Q-sphere draws the sphere/rings/spokes/nodes; Bloch keeps this surface clear
// because the visible Bloch cards render through their own passes.
function render(state) {
    if (!state) return;

    const commandEncoder = state.device.createCommandEncoder();
    const textureView = state.context.getCurrentTexture().createView();

    const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
            loadOp: 'clear',
            storeOp: 'store'
        }]
    });

    if (currentMode === 'qsphere') {
        passEncoder.setPipeline(state.pipeline);
        if (state.bindGroup) passEncoder.setBindGroup(0, state.bindGroup);
        passEncoder.setVertexBuffer(0, state.vertexBuffer);
        passEncoder.draw(state.vertexCount);

        if (state.linePipeline && state.qsphereLineVertexBuffer && state.qsphereLineVertexCount > 0) {
            passEncoder.setPipeline(state.linePipeline);
            passEncoder.setBindGroup(0, state.bindGroup);
            passEncoder.setVertexBuffer(0, state.qsphereLineVertexBuffer);
            passEncoder.draw(state.qsphereLineVertexCount);
        }

        if (state.spokePipeline && state.qsphereSpokeVertexBuffer && state.qsphereSpokeVertexCount > 0) {
            passEncoder.setPipeline(state.spokePipeline);
            passEncoder.setBindGroup(0, state.bindGroup);
            passEncoder.setVertexBuffer(0, state.qsphereSpokeVertexBuffer);
            passEncoder.draw(state.qsphereSpokeVertexCount);
        }
        if (state.qnodePipeline && state.qnodeVertexBuffer && state.qnodeVertexCount > 0) {
            passEncoder.setPipeline(state.qnodePipeline);
            passEncoder.setBindGroup(0, state.bindGroup);
            passEncoder.setVertexBuffer(0, state.qnodeVertexBuffer);
            passEncoder.draw(state.qnodeVertexCount);
        }
    }

    passEncoder.end();
    state.device.queue.submit([commandEncoder.finish()]);
}

// Dragging the full-size canvas rotates the current view around the vertical axis.
let webgpuState;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

canvas.addEventListener('mousedown', e => {
    isDragging = true;
    clearQsphereHover();
    previousMousePosition = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', updateQsphereHover);
canvas.addEventListener('mouseleave', clearQsphereHover);
window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;

    rotationAngles[1] += deltaX * 0.005;

    previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

// Positions of the six standard Bloch labels in model space.
const blochLabelDefs = [
    { id: 'label-zero', pos: [0, 1.15, 0] },
    { id: 'label-one', pos: [0, -1.15, 0] },
    { id: 'label-plus', pos: [1.15, 0, 0] },
    { id: 'label-minus', pos: [-1.15, 0, 0] },
    { id: 'label-i-plus', pos: [0, 0, 1.15] },
    { id: 'label-i-minus', pos: [0, 0, -1.15] }
];

// Project and position either Bloch labels or Q-sphere basis labels.
function updateLabels(modelMatrix) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const blochLabelsDiv = document.getElementById('bloch-labels');
    const qsLabelsDiv = document.getElementById('qs-labels');

    if (currentMode === 'bloch') {
        if (blochLabelsDiv) blochLabelsDiv.style.display = 'block';
        if (qsLabelsDiv) qsLabelsDiv.style.display = 'none';

        for (let i = 0; i < blochLabelDefs.length; i++) {
            const item = blochLabelDefs[i];
            const el = document.getElementById(item.id);
            if (!el) continue;
            const pt = projectPoint(item.pos, modelMatrix, w, h);
            if (pt) {
                el.style.transform = `translate(-50%, -50%) translate(${pt[0]}px, ${pt[1]}px)`;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }
    } else {
        if (blochLabelsDiv) blochLabelsDiv.style.display = 'none';
        if (qsLabelsDiv) {
            qsLabelsDiv.style.display = 'block';
            updateQsphereLabels(modelMatrix, w, h);
        }
    }
}

// Recreate Q-sphere labels when the number of basis states changes.
let _qsLabelData = [];

// Place the existing Q-sphere labels after each rotation.
function rebuildQsphereLabels(points, N) {
    const qsLabelsDiv = document.getElementById('qs-labels');
    if (!qsLabelsDiv) return;
    qsLabelsDiv.innerHTML = '';
    _qsLabelData = [];
    for (const pt of points) {
        const binaryStr = pt.index.toString(2).padStart(N, '0');
        const el = document.createElement('div');
        el.className = 'label qs-label';
        el.textContent = '|' + binaryStr + '⟩';
        el.dataset.ptIndex = String(pt.index);
        qsLabelsDiv.appendChild(el);
        _qsLabelData.push({ el, pos: [pt.x * 1.15, pt.y * 1.15, pt.z * 1.15] });
    }
}

// Project all Q-sphere label positions into the canvas.
function updateQsphereLabels(modelMatrix, w, h) {
    for (const item of _qsLabelData) {
        const pt = projectPoint(item.pos, modelMatrix, w, h);
        if (pt) {
            item.el.style.transform = `translate(-50%, -50%) translate(${pt[0]}px, ${pt[1]}px)`;
            item.el.style.display = 'block';
        } else {
            item.el.style.display = 'none';
        }
    }
}

// Main animation loop: interpolate arrows, update transforms, draw full-size and
// mini views, then schedule the next frame.
function frame() {
    if (webgpuState) {
        if (currentMode === 'bloch' && webgpuState.currentVector && webgpuState.targetVector) {
            const cur = webgpuState.currentVector;
            const tgt = webgpuState.targetVector;
            if (!vectorsClose(cur, tgt)) {
                const nextVec = interpolateVector(cur, tgt, 0.25);
                webgpuState.currentVector = vectorsClose(nextVec, tgt) ? [...tgt] : nextVec;
                const arrowVertices = buildArrowVertices(nextVec);
                if (arrowVertices.byteLength > 0) {
                    webgpuState.device.queue.writeBuffer(
                        webgpuState.arrowVertexBuffer, 0, arrowVertices
                    );
                }
                webgpuState.arrowVertexCount = arrowVertices.length / 6;
            } else if (webgpuState.stepQueue && webgpuState.stepQueue.length > 0) {
                webgpuState.targetVector = webgpuState.stepQueue.shift();
            }
        }

        const modelMatrix = rotateMatrix(...rotationAngles, webgpuState.projMatrix);
        webgpuState.device.queue.writeBuffer(webgpuState.vertexUniformBuffer, 0, modelMatrix);

        updateLabels(modelMatrix);
        render(webgpuState);
        for (const renderer of miniRenderers) {
            renderMiniRenderer(renderer, webgpuState);
        }
    }
    requestAnimationFrame(frame);
}

initWebGPU()

    .then(state => {
        webgpuState = state;
        if (lastParsedResult) {
            populateQubitColumn(lastParsedResult).catch(error => {
                console.error('Could not upgrade qubit spheres to WebGPU:', error);
            });
        }
        if (vscode) {
            vscode.postMessage({ command: 'ready' });
        }
        requestAnimationFrame(frame);
    })
    .catch(error => {
        console.error(error);
        fallbackMode = true;
        drawFallbackResult(lastParsedResult || { states: [] }, selectedQubitIndex);
        if (lastParsedResult) {
            populateQubitColumn(lastParsedResult).catch(populateError => {
                console.error('Could not render fallback qubit spheres:', populateError);
            });
        }
        setStatus('WebGPU setup failed.');
    });

// Resize the shared surface and rebuild its projection when the panel size changes.
window.addEventListener('resize', () => {
    resizeCanvas();
    if (webgpuState) {
        webgpuState.projMatrix = webgpuState.buildProjMatrix();
        render(webgpuState);
    }
});

// Show one view's DOM and hide the other. The container is removed/reinserted to
// prevent stale Q-sphere pixels from remaining behind Bloch cards.
function updateVisibility(qubitsDeclared) {
    const container = qsphereContainer;
    const controls = controlsContainer;
    const phaseLegend = document.getElementById('qsphere-phase-legend');
    if (container) {
        const showQsphere = currentMode === 'qsphere';
        if (showQsphere && !container.parentElement) {
            // Keep the legend after the sphere when the container is restored
            // after switching back from the Bloch view.
            document.body.insertBefore(container, phaseLegend || controls || null);
        } else if (!showQsphere && container.parentElement) {
            container.remove();
        }
        container.hidden = !showQsphere;
        container.style.display = showQsphere ? 'block' : 'none';
        canvas.style.visibility = showQsphere ? 'visible' : 'hidden';
        canvas.style.display = showQsphere ? 'block' : 'none';
        if (!showQsphere) {
            const qsLabels = document.getElementById('qs-labels');
            if (qsLabels) qsLabels.style.display = 'none';
        }
    }
    if (controls) {
        const showBloch = currentMode === 'bloch' && qubitsDeclared > 0;
        controls.hidden = !showBloch;
        controls.style.display = showBloch ? 'flex' : 'none';
    }
    if (phaseLegend) phaseLegend.style.display = currentMode === 'qsphere' ? 'block' : 'none';
}

// Rebuild the Bloch card list from the latest parser result.
async function populateQubitColumn(result) {
    const column = document.getElementById('qubit-column');
    if (!column) return;

    const qubitsList = result?.qubitsList || [];
    const count = Math.max(qubitsList.length, result?.qubitsDeclared || 0);
    currentQubitsList = qubitsList;

    column.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'qubit-mini';

        const label = document.createElement('div');
        label.className = 'qubit-mini-label';
        label.textContent = `Qubit ${i}`;

        const canvas = document.createElement('canvas');
        canvas.className = 'qubit-mini-canvas';
        canvas.width = qubitSphereSize;
        canvas.height = qubitSphereSize;

        card.appendChild(label);
        createQubitSphereStage(card, canvas);
        column.appendChild(card);

        if (fallbackMode) {
            const arrowResult = computeBlochArrow(result, i);
            drawMiniBlochSphere(canvas, arrowResult.screenVector, qubitsList[i] || `q${i}`);
        }
    }

    if (count > 0) {
        selectedQubitIndex = Math.min(selectedQubitIndex, count - 1);
        selectedQubitName = currentQubitsList[selectedQubitIndex] || null;
    }

    await renderMiniQubitColumn(result);
}

// Ignore stale source messages if an older Q# parse finishes after a newer edit.
let currentTargetOp = null;
let sourceUpdateGeneration = 0;

window.addEventListener('message', async event => {
    const message = event.data;
    if (message.command === 'replayAnimation') {
        replayAnimation();
        return;
    }
    if (message.command === 'init' || message.command === 'update') {
        if (message.data && message.data.code) {
            const updateGeneration = ++sourceUpdateGeneration;
            pendingCode = message.data.code;
            if (message.data.targetOp !== undefined) {
                currentTargetOp = message.data.targetOp;
            }
            const result = await parseQSharp(pendingCode, currentTargetOp);
            if (updateGeneration !== sourceUpdateGeneration) return;
            console.log('Q# Parse Result:', result);
            lastParsedResult = result;

            updateVisibility(result.qubitsDeclared);
            await populateQubitColumn(result);

            if (webgpuState) {
                if (currentMode === 'qsphere') {
                    updateQsphereState(result);
                } else {
                    const arrowResult = computeBlochArrow(result, selectedQubitIndex);
                    webgpuState.stepVectors = arrowResult.stepVectors || [];
                    webgpuState.targetVector = arrowResult.screenVector;
                    webgpuState.stepQueue = [];
                }
            } else if (fallbackMode) {
                drawFallbackResult(result, selectedQubitIndex);
            }
        }
        if (webgpuState) {
            render(webgpuState);
        }
    }
});


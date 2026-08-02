const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const canvas = document.querySelector('canvas');
const statusText = document.querySelector('#status');
let rotationAngles = [0.3, 0.0, 0.0];
let currentMode = 'bloch';
let lastParsedResult = null;
let selectedQubitIndex = 0;
let selectedQubitName = null;

function setStatus(message) {
    statusText.textContent = message;
}

async function loadShader(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${path}`);
    }

    return response.text();
}

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

function drawFallbackResult(result, targetQubit = 0) {
    const arrowResult = computeBlochArrow(result, targetQubit);
    drawFallbackBloch(arrowResult.screenVector);
}

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

    const [vertexShader, fragmentShader, arrowFragShader, linesFragShader, qnodesFragShader] = await Promise.all([
        loadShader(vertexShaderUri),
        loadShader(fragmentShaderUri),
        loadShader(arrowShaderUri),
        loadShader(linesShaderUri),
        loadShader(qnodesShaderUri)
    ]);

    const vertexModule = device.createShaderModule({ code: vertexShader });
    const fragmentModule = device.createShaderModule({ code: fragmentShader });
    const arrowFragModule = device.createShaderModule({ code: arrowFragShader });
    const linesFragModule = device.createShaderModule({ code: linesFragShader });
    const qnodesFragModule = device.createShaderModule({ code: qnodesFragShader });


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
            module: vertexModule,
            entryPoint: 'main',
            buffers: [vertexBufferLayout]
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
        size: arrowVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    const arrowVertexCount = arrowVertices.length / 6;
    device.queue.writeBuffer(arrowVertexBuffer, 0, arrowVertices);

    const qnodeVertexBuffer = device.createBuffer({
        label: 'QNode Vertex Buffer',
        size: 4 * 1024 * 1024,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    let qnodeVertexCount = 0;

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
        bindGroup, vertexUniformBuffer, projMatrix, buildProjMatrix,
        arrowPipeline, arrowVertexBuffer, arrowVertexCount,
        linePipeline, lineVertexBuffer, lineVertexCount,
        qnodePipeline, qnodeVertexBuffer, qnodeVertexCount,
        currentVector, targetVector, stepVectors, stepQueue: []
    };
}

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

    passEncoder.setPipeline(state.pipeline);
    if (state.bindGroup) passEncoder.setBindGroup(0, state.bindGroup);
    passEncoder.setVertexBuffer(0, state.vertexBuffer);
    passEncoder.draw(state.vertexCount);

    if (state.linePipeline && state.lineVertexBuffer && state.lineVertexCount > 0) {
        passEncoder.setPipeline(state.linePipeline);
        passEncoder.setBindGroup(0, state.bindGroup);
        passEncoder.setVertexBuffer(0, state.lineVertexBuffer);
        passEncoder.draw(state.lineVertexCount);
    }

    if (currentMode === 'bloch') {
        if (state.arrowPipeline && state.arrowVertexBuffer && state.arrowVertexCount > 0) {
            passEncoder.setPipeline(state.arrowPipeline);
            passEncoder.setBindGroup(0, state.bindGroup);
            passEncoder.setVertexBuffer(0, state.arrowVertexBuffer);
            passEncoder.draw(state.arrowVertexCount);
        }
    } else {
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

let webgpuState;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

canvas.addEventListener('mousedown', e => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;

    rotationAngles[1] += deltaX * 0.005;

    previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

const blochLabelDefs = [
    { id: 'label-zero', pos: [0, 1.15, 0] },
    { id: 'label-one', pos: [0, -1.15, 0] },
    { id: 'label-plus', pos: [1.15, 0, 0] },
    { id: 'label-minus', pos: [-1.15, 0, 0] },
    { id: 'label-i-plus', pos: [0, 0, 1.15] },
    { id: 'label-i-minus', pos: [0, 0, -1.15] }
];

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

let _qsLabelData = [];

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

function frame() {
    if (webgpuState) {
        if (currentMode === 'bloch' && webgpuState.currentVector && webgpuState.targetVector) {
            const cur = webgpuState.currentVector;
            const tgt = webgpuState.targetVector;
            if (cur[0] !== tgt[0] || cur[1] !== tgt[1] || cur[2] !== tgt[2]) {
                const nextVec = interpolateVector(cur, tgt, 0.25);
                webgpuState.currentVector = nextVec;
                const arrowVertices = buildArrowVertices(nextVec);
                webgpuState.device.queue.writeBuffer(
                    webgpuState.arrowVertexBuffer, 0, arrowVertices
                );
                webgpuState.arrowVertexCount = arrowVertices.length / 6;
            } else if (webgpuState.stepQueue && webgpuState.stepQueue.length > 0) {
                webgpuState.targetVector = webgpuState.stepQueue.shift();
            }
        }

        const modelMatrix = rotateMatrix(...rotationAngles, webgpuState.projMatrix);
        webgpuState.device.queue.writeBuffer(webgpuState.vertexUniformBuffer, 0, modelMatrix);

        updateLabels(modelMatrix);
        render(webgpuState);
    }
    requestAnimationFrame(frame);
}

initWebGPU()

    .then(state => {
        webgpuState = state;
        if (vscode) {
            vscode.postMessage({ command: 'ready' });
        }
        requestAnimationFrame(frame);
    })
    .catch(error => {
        console.error(error);
        fallbackMode = true;
        drawFallbackResult(lastParsedResult || { states: [] }, selectedQubitIndex);
        setStatus('WebGPU setup failed.');
    });

window.addEventListener('resize', () => {
    resizeCanvas();
    if (webgpuState) {
        webgpuState.projMatrix = webgpuState.buildProjMatrix();
        render(webgpuState);
    }
});

function updateVisibility(qubitsDeclared) {
    const container = document.getElementById('container');
    const controls = document.getElementById('controls');
    if (container) container.style.display = qubitsDeclared > 0 ? 'block' : 'none';
    if (controls) controls.style.display = qubitsDeclared > 0 ? 'flex' : 'none';
}

function populateQubitDropdown(qubitsList) {
    const sel = document.getElementById('qubit-select');
    if (!sel) return;
    const prevName = selectedQubitName;
    sel.innerHTML = '';
    for (let i = 0; i < qubitsList.length; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = qubitsList[i];
        sel.appendChild(opt);
    }
    const prevIdx = prevName !== null ? qubitsList.indexOf(prevName) : -1;
    if (prevIdx !== -1) {
        selectedQubitIndex = prevIdx;
        sel.value = String(prevIdx);
    } else {
        selectedQubitIndex = 0;
        sel.value = '0';
    }
    selectedQubitName = qubitsList[selectedQubitIndex] || null;
}

const qubitSelect = document.getElementById('qubit-select');
if (qubitSelect) {
    qubitSelect.addEventListener('change', () => {
        selectedQubitIndex = parseInt(qubitSelect.value, 10);
        selectedQubitName = qubitSelect.options[qubitSelect.selectedIndex]
            ? qubitSelect.options[qubitSelect.selectedIndex].textContent
            : null;
        if (webgpuState && lastParsedResult && currentMode === 'bloch') {
            const arrowResult = computeBlochArrow(lastParsedResult, selectedQubitIndex);
            const newVec = arrowResult.screenVector;
            webgpuState.stepVectors = arrowResult.stepVectors || [];
            webgpuState.targetVector = newVec;
            webgpuState.currentVector = newVec;
            webgpuState.stepQueue = [];
            const arrowVerts = buildArrowVertices(newVec);
            webgpuState.device.queue.writeBuffer(webgpuState.arrowVertexBuffer, 0, arrowVerts);
            webgpuState.arrowVertexCount = arrowVerts.length / 6;
            render(webgpuState);
        }
        if (fallbackMode && lastParsedResult) {
            drawFallbackResult(lastParsedResult, selectedQubitIndex);
        }
    });
}

const modeBtn = document.querySelector('#mode-btn');
if (modeBtn) {
    modeBtn.addEventListener('click', () => {
        currentMode = currentMode === 'bloch' ? 'qsphere' : 'bloch';
        modeBtn.textContent = currentMode === 'bloch' ? 'Q-sphere' : 'Bloch';
        if (webgpuState && lastParsedResult) {
            if (currentMode === 'qsphere') {
                const qs = computeQsphere(lastParsedResult);
                const nodeVerts = qs.nodeVertices;
                if (nodeVerts.byteLength <= webgpuState.qnodeVertexBuffer.size) {
                    webgpuState.device.queue.writeBuffer(webgpuState.qnodeVertexBuffer, 0, nodeVerts);
                    webgpuState.qnodeVertexCount = nodeVerts.length / 6;
                }
                const ringVerts = qs.ringVertices;
                if (ringVerts.byteLength <= webgpuState.lineVertexBuffer.size) {
                    webgpuState.device.queue.writeBuffer(webgpuState.lineVertexBuffer, 0, ringVerts);
                    webgpuState.lineVertexCount = ringVerts.length / 6;
                }
                rebuildQsphereLabels(qs.points, qs.N);
            } else {
                const arrowResult = computeBlochArrow(lastParsedResult, selectedQubitIndex);
                const arrowVerts = arrowResult.vertices;
                if (arrowVerts.byteLength <= webgpuState.arrowVertexBuffer.size) {
                    webgpuState.device.queue.writeBuffer(webgpuState.arrowVertexBuffer, 0, arrowVerts);
                    webgpuState.arrowVertexCount = arrowVerts.length / 6;
                }
                const lineVerts = buildSphereLines();
                webgpuState.device.queue.writeBuffer(webgpuState.lineVertexBuffer, 0, lineVerts);
                webgpuState.lineVertexCount = lineVerts.length / 6;
                webgpuState.targetVector = arrowResult.screenVector;
                webgpuState.currentVector = arrowResult.screenVector;
            }
            render(webgpuState);
        }
    });
}

window.addEventListener('message', async event => {
    const message = event.data;
    if (message.command === 'init' || message.command === 'update') {
        if (message.data && message.data.code) {
            pendingCode = message.data.code;
            const result = await parseQSharp(pendingCode);
            console.log('Q# Parse Result:', result);
            lastParsedResult = result;

            updateVisibility(result.qubitsDeclared);
            populateQubitDropdown(result.qubitsList || []);

            if (webgpuState) {
                if (currentMode === 'qsphere') {
                    const qs = computeQsphere(result);
                    const nodeVerts = qs.nodeVertices;
                    if (nodeVerts.byteLength <= webgpuState.qnodeVertexBuffer.size) {
                        webgpuState.device.queue.writeBuffer(webgpuState.qnodeVertexBuffer, 0, nodeVerts);
                        webgpuState.qnodeVertexCount = nodeVerts.length / 6;
                    }
                    const ringVerts = qs.ringVertices;
                    if (ringVerts.byteLength <= webgpuState.lineVertexBuffer.size) {
                        webgpuState.device.queue.writeBuffer(webgpuState.lineVertexBuffer, 0, ringVerts);
                        webgpuState.lineVertexCount = ringVerts.length / 6;
                    }
                    rebuildQsphereLabels(qs.points, qs.N);
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

const replayBtn = document.querySelector('#replay-btn');
if (replayBtn) {
    replayBtn.addEventListener('click', () => {
        if (webgpuState && webgpuState.stepVectors && webgpuState.stepVectors.length > 0) {
            const queue = webgpuState.stepVectors.map(v => [v[0], v[1], v[2]]);
            webgpuState.currentVector = queue.shift();
            webgpuState.targetVector = queue.length > 0 ? queue.shift() : webgpuState.currentVector;
            webgpuState.stepQueue = queue;
        } else if (webgpuState && webgpuState.targetVector) {
            webgpuState.currentVector = [0, 1, 0];
            webgpuState.stepQueue = [];
        }
    });
}

import * as THREE from 'three';
import {
    vec3Normalize,
    vectorsClose,
    interpolateVector,
    distanceToSegment,
    mult,
    createPerspectiveMatrix,
    createTranslationMatrix,
    rotateMatrix,
    projectPoint,
    extractQubitBloch
} from '../math/index.js';
import { createHoverTooltip } from '../render/hoverTooltip.js';

function computeBlochArrow(result, targetQubit = 0) {
    const snapshots = result?.states || [];
    const stepVectors = snapshots.map(snapshot => {
        const bloch = extractQubitBloch(snapshot, targetQubit);
        return [bloch[0], bloch[2], bloch[1]];
    });
    const screenVector = stepVectors.length > 0 ? stepVectors[stepVectors.length - 1] : [0, 1, 0];
    return {
        screenVector,
        stepVectors
    };
}

const BLOCH_LABEL_MAP = {
    'label-zero': '|0⟩',
    'label-one': '|1⟩',
    'label-plus': '|+⟩',
    'label-minus': '|-⟩',
    'label-i-plus': '|+i⟩',
    'label-i-minus': '|-i⟩'
};

const blochLabelDefs = [
    { id: 'label-zero', pos: [0, 1.15, 0] },
    { id: 'label-one', pos: [0, -1.15, 0] },
    { id: 'label-plus', pos: [1.15, 0, 0] },
    { id: 'label-minus', pos: [-1.15, 0, 0] },
    { id: 'label-i-plus', pos: [0, 0, 1.15] },
    { id: 'label-i-minus', pos: [0, 0, -1.15] }
];

function getBlochModelMatrix(rotation, projMatrix) {
    return rotateMatrix(...rotation, projMatrix);
}

function computeBlochCardLayout(numQubits) {
    const cols = numQubits <= 3 ? numQubits : Math.min(4, Math.ceil(Math.sqrt(numQubits)));
    const rows = Math.ceil(numQubits / cols);
    const cardW = 270;
    const cardH = 320;
    const gap = 24;
    const totalW = cols * cardW + (cols + 1) * gap;
    const totalH = rows * cardH + (rows + 1) * gap;
    return { cols, rows, cardW, cardH, gap, totalW, totalH };
}

function getProjectedBlochLabels(modelMatrix, width, height) {
    const results = [];
    for (let i = 0; i < blochLabelDefs.length; i++) {
        const def = blochLabelDefs[i];
        const pt = projectPoint(def.pos, modelMatrix, width, height);
        results.push({
            id: def.id,
            text: BLOCH_LABEL_MAP[def.id] || '',
            point: pt
        });
    }
    return results;
}

function getBlochWireframePoints(modelMatrix, width, height, segments = 32) {
    const planes = [];
    for (let plane = 0; plane < 3; plane++) {
        const points = [];
        for (let s = 0; s <= segments; s++) {
            const a = (s / segments) * 2 * Math.PI;
            const c = Math.cos(a), sn = Math.sin(a);
            const pos = plane === 0 ? [c, 0, sn] : (plane === 1 ? [c, sn, 0] : [0, sn, c]);
            const pt = projectPoint(pos, modelMatrix, width, height);
            if (pt) points.push(pt);
        }
        planes.push(points);
    }
    return planes;
}

function getBlochAxes(modelMatrix, width, height) {
    const axes = [
        { from: [-1, 0, 0], to: [1, 0, 0] },
        { from: [0, -1, 0], to: [0, 1, 0] },
        { from: [0, 0, -1], to: [0, 0, 1] }
    ];
    return axes.map(axis => ({
        p1: projectPoint(axis.from, modelMatrix, width, height),
        p2: projectPoint(axis.to, modelMatrix, width, height)
    }));
}

function createSphereMaterial() {
    return new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(vViewPosition);
                float rim = 1.0 - max(dot(viewDir, normal), 0.0);
                rim = smoothstep(0.4, 0.98, rim);
                vec3 rimColor = vec3(0.35, 0.45, 0.65);
                float alpha = rim * 0.12;
                gl_FragColor = vec4(rimColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide
    });
}

function createLineMaterial() {
    return new THREE.LineBasicMaterial({
        color: 0x5a6578,
        transparent: true,
        opacity: 0.35
    });
}

function createArrowMaterial() {
    return new THREE.MeshBasicMaterial({
        color: 0xe6edf3,
        transparent: true,
        opacity: 0.95
    });
}

function createSphereWireframe(lineMat) {
    const group = new THREE.Group();
    const segments = 64;
    const mat = lineMat || createLineMaterial();

    const axisPositions = new Float32Array([
        -1, 0, 0, 1, 0, 0,
        0, -1, 0, 0, 1, 0,
        0, 0, -1, 0, 0, 1
    ]);
    const axisGeo = new THREE.BufferGeometry();
    axisGeo.setAttribute('position', new THREE.BufferAttribute(axisPositions, 3));
    group.add(new THREE.LineSegments(axisGeo, mat));

    for (let plane = 0; plane < 3; plane++) {
        const circleVerts = [];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * 2 * Math.PI;
            const c = Math.cos(a), s = Math.sin(a);
            if (plane === 0) circleVerts.push(c, 0, s);
            else if (plane === 1) circleVerts.push(c, s, 0);
            else circleVerts.push(0, s, c);
        }
        const circleGeo = new THREE.BufferGeometry();
        circleGeo.setAttribute('position', new THREE.Float32BufferAttribute(circleVerts, 3));
        group.add(new THREE.Line(circleGeo, mat));
    }

    group.scale.set(1.025, 1.025, 1.025);
    return group;
}

function createArrowMesh(blochVec, material) {
    const group = new THREE.Group();
    const r = Math.sqrt(blochVec[0] ** 2 + blochVec[1] ** 2 + blochVec[2] ** 2);
    if (r < 0.001) return group;

    const shaftRadius = 0.02 * Math.max(0.3, Math.min(1.0, r));
    const headRadius = 0.055 * Math.max(0.3, Math.min(1.0, r));
    const headLength = 0.14 * r;
    const shaftLength = 0.86 * r;

    const useMat = material || createArrowMaterial();

    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12);
    shaftGeo.translate(0, shaftLength / 2, 0);
    const shaft = new THREE.Mesh(shaftGeo, useMat);
    group.add(shaft);

    const headGeo = new THREE.ConeGeometry(headRadius, headLength, 12);
    headGeo.translate(0, shaftLength + headLength / 2, 0);
    const head = new THREE.Mesh(headGeo, useMat);
    group.add(head);

    const dir = new THREE.Vector3(blochVec[0], blochVec[1], blochVec[2]).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.dot(up)) > 0.9999) {
        if (dir.y < 0) {
            group.rotation.z = Math.PI;
        }
    } else {
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        group.quaternion.copy(quat);
    }

    group.scale.set(1.05, 1.05, 1.05);
    return group;
}

function updateArrowHover(renderer, event) {
    if (!renderer.hoverInfo) return;

    const width = renderer.stage.clientWidth;
    const height = renderer.stage.clientHeight;
    const rect = renderer.canvas.getBoundingClientRect();
    const point = [event.clientX - rect.left, event.clientY - rect.top];
    const modelMatrix = rotateMatrix(...renderer.rotation, renderer._projMatrix);
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

const qubitSphereSize = 270;
let miniRenderers = [];
let currentQubitsList = [];
let selectedQubitIndex = 0;
let selectedQubitName = null;
let lastResult = null;

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

function createMiniRenderer(canvasElement, result, qubitIndex, previousVector, previousRotation) {
    const miniRenderer = new THREE.WebGLRenderer({
        canvas: canvasElement,
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true
    });
    miniRenderer.setClearColor(0x000000, 0);
    miniRenderer.setPixelRatio(window.devicePixelRatio || 1);
    miniRenderer.setSize(canvasElement.clientWidth || qubitSphereSize, canvasElement.clientHeight || qubitSphereSize, false);

    const scene = new THREE.Scene();
    const aspect = (canvasElement.clientWidth || qubitSphereSize) / (canvasElement.clientHeight || qubitSphereSize);
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const sphereMaterial = createSphereMaterial();
    const lineMaterial = createLineMaterial();
    const arrowMaterial = createArrowMaterial();

    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    scene.add(new THREE.Mesh(sphereGeo, sphereMaterial));
    scene.add(createSphereWireframe(lineMaterial));

    const arrowResult = computeBlochArrow(result, qubitIndex);
    const finalVector = arrowResult.screenVector || [0, 1, 0];
    const currentVector = previousVector || finalVector;
    const targetVector = finalVector;
    const stepQueue = [];

    const arrowGroup = new THREE.Group();
    const initialArrow = createArrowMesh(currentVector, arrowMaterial);
    arrowGroup.add(initialArrow);
    scene.add(arrowGroup);


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
        rendererObj.needsRender = true;
    });
    canvasElement.addEventListener('mouseup', () => { dragging = false; });
    canvasElement.addEventListener('mouseleave', () => { dragging = false; });

    const projMatrix = mult(
        createPerspectiveMatrix(Math.PI / 4, aspect, 0.1, 100),
        createTranslationMatrix(0, 0, -3)
    );

    const rendererObj = {
        canvas: canvasElement,
        stage: canvasElement.parentElement,
        labels: [...canvasElement.parentElement.querySelectorAll('.qubit-bloch-label')],
        threeRenderer: miniRenderer,
        scene,
        camera,
        arrowGroup,
        arrowMaterial,
        sphereMaterial,
        lineMaterial,
        currentVector: [...currentVector],
        targetVector: [...targetVector],
        stepQueue,
        rotation,
        qubitIndex,
        hoverInfo: null,
        arrowVector: arrowResult.screenVector,
        _projMatrix: projMatrix,
        needsRender: true
    };

    try {
        const hoverInfo = createHoverTooltip(rendererObj.stage, 'qubit-hover-info');
        rendererObj.hoverInfo = hoverInfo;

        canvasElement.addEventListener('mousemove', event => {
            updateArrowHover(rendererObj, event);
            rendererObj.needsRender = true;
        });
        canvasElement.addEventListener('mouseleave', () => {
            if (rendererObj.hoverInfo) rendererObj.hoverInfo.hidden = true;
        });
    } catch (error) {
        console.warn('Arrow hover information unavailable:', error);
    }

    return rendererObj;
}

function renderMiniRenderer(renderer) {
    if (!renderer.threeRenderer) return;

    const current = renderer.currentVector;
    const target = renderer.targetVector;
    const isVectorClose = vectorsClose(current, target);
    const hasQueuedSteps = Boolean(renderer.stepQueue && renderer.stepQueue.length > 0);

    const isSettled = isVectorClose && !hasQueuedSteps;
    if (isSettled && !renderer.needsRender) {
        return;
    }

    if (!isVectorClose) {
        const nextVector = interpolateVector(current, target, 0.25);
        renderer.currentVector = vectorsClose(nextVector, target) ? [...target] : nextVector;

        while (renderer.arrowGroup.children.length > 0) {
            const c = renderer.arrowGroup.children[0];
            renderer.arrowGroup.remove(c);
            if (c.traverse) {
                c.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                });
            }
        }
        renderer.arrowGroup.add(createArrowMesh(renderer.currentVector, renderer.arrowMaterial));
    } else if (hasQueuedSteps) {
        renderer.targetVector = renderer.stepQueue.shift();
        renderer.needsRender = true;
    }

    renderer.scene.rotation.set(renderer.rotation[0], renderer.rotation[1], renderer.rotation[2]);
    updateMiniLabels(renderer, rotateMatrix(...renderer.rotation, renderer._projMatrix));

    try {
        renderer.threeRenderer.render(renderer.scene, renderer.camera);
    } catch (e) {
        // Suppress transient render errors
    }

    if (vectorsClose(renderer.currentVector, renderer.targetVector) && (!renderer.stepQueue || renderer.stepQueue.length === 0)) {
        renderer.needsRender = false;
    }
}

function updateMiniLabels(renderer, modelMatrix) {
    const width = renderer.stage.clientWidth;
    const height = renderer.stage.clientHeight;
    const projected = getProjectedBlochLabels(modelMatrix, width, height);
    for (let i = 0; i < projected.length; i++) {
        const label = renderer.labels[i];
        if (!label) continue;
        const pt = projected[i].point;
        if (pt) {
            label.style.transform = `translate(-50%, -50%) translate(${pt[0]}px, ${pt[1]}px)`;
            label.style.display = 'block';
        } else {
            label.style.display = 'none';
        }
    }
}

function destroyMiniRenderers() {
    for (const renderer of miniRenderers) {
        if (renderer.threeRenderer) {
            try {
                renderer.threeRenderer.forceContextLoss();
                renderer.threeRenderer.dispose();
            } catch (e) {
                console.warn('Error disposing mini renderer:', e);
            }
        }
        if (renderer.scene) {
            renderer.scene.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
        }
    }
    miniRenderers = [];
}

function populateQubitColumn(result) {
    const column = document.getElementById('qubit-column');
    if (!column) return;

    const qubitsList = result?.qubitsList || [];
    const count = Math.max(qubitsList.length, result?.qubitsDeclared || 0);
    currentQubitsList = qubitsList;

    // Fast-path: If the qubit count hasn't changed, reuse the active WebGL contexts in place!
    if (miniRenderers.length === count && count > 0) {
        for (let i = 0; i < count; i++) {
            const renderer = miniRenderers[i];
            const arrowResult = computeBlochArrow(result, i);
            renderer.targetVector = arrowResult.screenVector || [0, 1, 0];
            renderer.stepQueue = [];
            renderer.arrowVector = arrowResult.screenVector;
            renderer.needsRender = true;
            const card = column.children[i];
            if (card) {
                const label = card.querySelector('.qubit-mini-label');
                if (label) label.textContent = `Qubit ${i}`;
            }
        }
        return;
    }

    // Qubit count actually changed: destroy old WebGL contexts properly and rebuild
    destroyMiniRenderers();
    column.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'qubit-mini';

        const label = document.createElement('div');
        label.className = 'qubit-mini-label';
        label.textContent = `Qubit ${i}`;

        const miniCanvas = document.createElement('canvas');
        miniCanvas.className = 'qubit-mini-canvas';
        miniCanvas.width = qubitSphereSize;
        miniCanvas.height = qubitSphereSize;

        card.appendChild(label);
        createQubitSphereStage(card, miniCanvas);
        column.appendChild(card);
    }

    if (count > 0) {
        selectedQubitIndex = Math.min(selectedQubitIndex, count - 1);
        selectedQubitName = currentQubitsList[selectedQubitIndex] || null;
    }

    const canvases = [...column.querySelectorAll('.qubit-mini-canvas')];
    miniRenderers = canvases.map((canvasElement, index) =>
        createMiniRenderer(canvasElement, result, index)
    ).filter(Boolean);
}

function replayAnimation() {
    if (!lastResult) return;

    for (let index = 0; index < miniRenderers.length; index++) {
        const renderer = miniRenderers[index];
        const arrowResult = computeBlochArrow(lastResult, index);
        const stepVectors = arrowResult.stepVectors || [];
        const groundState = [0, 1, 0];
        const fullSteps = (stepVectors.length === 0 || !vectorsClose(stepVectors[0], groundState))
            ? [groundState, ...stepVectors]
            : stepVectors;
        const firstVector = fullSteps[0] || [0, 1, 0];
        const nextTarget = fullSteps[1] || firstVector;
        renderer.currentVector = [...firstVector];
        renderer.targetVector = [...nextTarget];
        renderer.stepQueue = fullSteps.slice(2);
        renderer.needsRender = true;

        while (renderer.arrowGroup.children.length > 0) {
            const c = renderer.arrowGroup.children[0];
            renderer.arrowGroup.remove(c);
            if (c.traverse) c.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
        }
        renderer.arrowGroup.add(createArrowMesh(firstVector, renderer.arrowMaterial));
    }
}

/*
function generateSingleBlochSvg(qubitIndex = 0) {
    const renderer = miniRenderers[qubitIndex];
    const size = 350;
    const stageSize = 270;
    const stageX = (size - stageSize) / 2;
    const stageY = 42;

    if (!renderer) {
        return `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n` +
            `  <defs>\n` +
            `    <style>\n` +
            `      text { font-family: system-ui, -apple-system, sans-serif; }\n` +
            `    </style>\n` +
            `  </defs>\n` +
            `  <text x="${size / 2}" y="${size / 2}" fill="#e6e6ee" font-size="14" text-anchor="middle">No qubits declared</text>\n` +
            `</svg>`;
    }

    const rotation = renderer.rotation || [0.3, 0.0, 0.0];
    const modelMatrix = getBlochModelMatrix(rotation, renderer._projMatrix);

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n` +
        `  <defs>\n` +
        `    <style>\n` +
        `      text { font-family: system-ui, -apple-system, sans-serif; }\n` +
        `    </style>\n` +
        `  </defs>\n` +
        `  <g transform="translate(${stageX}, 0)">\n` +
        `    <text x="${stageSize / 2}" y="24" fill="#e6e6ee" font-size="15" font-weight="bold" letter-spacing="0.3" text-anchor="middle">Qubit ${qubitIndex}</text>\n`;

    // Wireframe circles (3 orthogonal planes)
    const wireframePlanes = getBlochWireframePoints(modelMatrix, stageSize, stageSize);
    for (const planePoints of wireframePlanes) {
        if (planePoints.length > 1) {
            const polyPoints = planePoints.map(pt => `${pt[0].toFixed(1)},${(pt[1] + stageY).toFixed(1)}`).join(' ');
            svg += `    <polyline points="${polyPoints}" fill="none" stroke="#5a6578" stroke-width="1" stroke-opacity="0.45"/>\n`;
        }
    }

    // Axes (X, Y, Z)
    const axes = getBlochAxes(modelMatrix, stageSize, stageSize);
    for (const axis of axes) {
        if (axis.p1 && axis.p2) {
            svg += `    <line x1="${axis.p1[0].toFixed(1)}" y1="${(axis.p1[1] + stageY).toFixed(1)}" x2="${axis.p2[0].toFixed(1)}" y2="${(axis.p2[1] + stageY).toFixed(1)}" stroke="#5a6578" stroke-width="1" stroke-dasharray="3,3" stroke-opacity="0.6"/>\n`;
        }
    }

    // Basis state labels
    const projectedLabels = getProjectedBlochLabels(modelMatrix, stageSize, stageSize);
    for (const item of projectedLabels) {
        if (item.point) {
            svg += `    <text x="${item.point[0].toFixed(1)}" y="${(item.point[1] + stageY + 4).toFixed(1)}" fill="#e0e0e0" font-size="12" font-weight="bold" text-anchor="middle">${item.text}</text>\n`;
        }
    }

    // State vector arrow
    const centerPt = projectPoint([0, 0, 0], modelMatrix, stageSize, stageSize);
    const tipPt = projectPoint(renderer.currentVector, modelMatrix, stageSize, stageSize);

    if (centerPt && tipPt) {
        const dx = tipPt[0] - centerPt[0];
        const dy = tipPt[1] - centerPt[1];
        const len = Math.hypot(dx, dy);

        if (len > 3) {
            const angle = Math.atan2(dy, dx);
            const headLen = Math.min(10, len * 0.35);
            const leftAngle = angle + Math.PI * 0.82;
            const rightAngle = angle - Math.PI * 0.82;
            const hx1 = tipPt[0] + headLen * Math.cos(leftAngle);
            const hy1 = tipPt[1] + stageY + headLen * Math.sin(leftAngle);
            const hx2 = tipPt[0] + headLen * Math.cos(rightAngle);
            const hy2 = tipPt[1] + stageY + headLen * Math.sin(rightAngle);

            svg += `    <line x1="${centerPt[0].toFixed(1)}" y1="${(centerPt[1] + stageY).toFixed(1)}" x2="${tipPt[0].toFixed(1)}" y2="${(tipPt[1] + stageY).toFixed(1)}" stroke="#e6edf3" stroke-width="2.5" stroke-linecap="round"/>\n`;
            svg += `    <polygon points="${tipPt[0].toFixed(1)},${(tipPt[1] + stageY).toFixed(1)} ${hx1.toFixed(1)},${hy1.toFixed(1)} ${hx2.toFixed(1)},${hy2.toFixed(1)}" fill="#e6edf3"/>\n`;
        }
    }

    // Summary text below sphere
    const blochZ = renderer.currentVector[1];
    const prob0 = ((1 + blochZ) / 2 * 100).toFixed(1);
    const prob1 = ((1 - blochZ) / 2 * 100).toFixed(1);
    svg += `    <text x="${stageSize / 2}" y="${size - 14}" fill="rgba(255,255,255,0.75)" font-size="11" font-weight="500" text-anchor="middle">P(|0⟩): ${prob0}%  •  P(|1⟩): ${prob1}%</text>\n`;

    svg += `  </g>\n`;
    svg += `</svg>`;
    return svg;
}
*/

function generateSingleBlochPng(qubitIndex = 0) {
    const renderer = miniRenderers[qubitIndex];
    if (!renderer || !renderer.threeRenderer) return '';

    const size = 350;
    const stageSize = 270;
    const stageX = (size - stageSize) / 2;
    const stageY = 42;
    const dpr = window.devicePixelRatio || 1;

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.floor(size * dpr);
    offscreen.height = Math.floor(size * dpr);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return '';

    ctx.save();
    ctx.scale(dpr, dpr);

    // Render current 3D state
    renderer.threeRenderer.render(renderer.scene, renderer.camera);

    // Title (cleanly spaced, transparent background - no card)
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#e6e6ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Qubit ${qubitIndex}`, size / 2, 24);

    // Draw WebGL canvas
    ctx.drawImage(renderer.canvas, stageX, stageY, stageSize, stageSize);

    // Draw basis state labels using current live rotation
    const rotation = renderer.rotation || [0.3, 0.0, 0.0];
    const modelMatrix = getBlochModelMatrix(rotation, renderer._projMatrix);
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#e0e0e0';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;

    const projectedLabels = getProjectedBlochLabels(modelMatrix, stageSize, stageSize);
    for (const item of projectedLabels) {
        if (item.point) {
            ctx.fillText(item.text, stageX + item.point[0], stageY + item.point[1] + 4);
        }
    }
    ctx.shadowBlur = 0;

    // Summary text below sphere
    const blochZ = renderer.currentVector[1];
    const prob0 = ((1 + blochZ) / 2 * 100).toFixed(1);
    const prob1 = ((1 - blochZ) / 2 * 100).toFixed(1);
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`P(|0⟩): ${prob0}%  •  P(|1⟩): ${prob1}%`, size / 2, size - 14);

    ctx.restore();
    return offscreen.toDataURL('image/png');
}

// SVG export functions deactivated for now
// function generateBlochSvg(qubitIndex = 0) {
//     return generateSingleBlochSvg(qubitIndex);
// }

function generateBlochPng(qubitIndex = 0) {
    return generateSingleBlochPng(qubitIndex);
}

const blochVisualization = {
    id: 'bloch',
    label: 'Bloch',

    mount(container) {
        const controls = document.getElementById('controls');
        if (controls) {
            controls.hidden = false;
            controls.style.display = 'flex';
        }
        if (lastResult) {
            populateQubitColumn(lastResult);
        }
    },

    unmount() {
        const controls = document.getElementById('controls');
        if (controls) {
            controls.hidden = true;
            controls.style.display = 'none';
        }
    },

    update(result) {
        if (!result) return;
        lastResult = result;
        populateQubitColumn(result);
    },

    animate() {
        for (const renderer of miniRenderers) {
            renderMiniRenderer(renderer);
        }
    },

    replayAnimation,

    async export() {
        const numQubits = miniRenderers.length;
        if (numQubits === 0) {
            // const svgContent = generateSingleBlochSvg(0);
            return {
                filenamePrefix: 'bloch',
                files: [{ name: 'bloch', pngDataUrl: '' /*, svgContent */ }],
                pngDataUrl: ''
                // svgContent
            };
        }

        const files = [];
        for (let i = 0; i < numQubits; i++) {
            // const svgContent = generateSingleBlochSvg(i);
            const pngDataUrl = generateSingleBlochPng(i);
            const name = numQubits === 1 ? 'bloch' : `bloch_qubit${i}`;
            files.push({
                name,
                pngDataUrl
                // svgContent
            });
        }

        return {
            filenamePrefix: 'bloch',
            files,
            pngDataUrl: files[0]?.pngDataUrl
            // svgContent: files[0]?.svgContent
        };
    }
};

export default blochVisualization;

export {
    blochVisualization,
    extractQubitBloch,
    computeBlochArrow,
    populateQubitColumn,
    destroyMiniRenderers,
    replayAnimation,
    createSphereMaterial,
    createLineMaterial,
    createArrowMaterial,
    createSphereWireframe,
    createArrowMesh,
    computeBlochCardLayout,
    getBlochModelMatrix,
    getProjectedBlochLabels,
    getBlochWireframePoints,
    getBlochAxes,
    // generateBlochSvg,
    generateBlochPng,
    // generateSingleBlochSvg,
    generateSingleBlochPng
};


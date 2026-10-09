import * as THREE from 'three';
import {
    getVisualization,
    getAllVisualizations,
    registerVisualization
} from './visualizations/index.js';
import {
    createSphereMaterial,
    createLineMaterial,
    createSphereWireframe
} from './visualizations/bloch.js';
import katex from 'katex';
import {
    getPhaseToRgb,
    mult,
    createPerspectiveMatrix,
    createTranslationMatrix,
    rotateMatrix,
    formatQuantumStateKaTeX,
    getQsphereState
} from './math/index.js';
import { drawPhaseLegendToCanvas } from './render/phaseLegend.js';
import { simulateOpenQasm } from './runtime/simulator.js';

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const canvas = typeof document !== 'undefined' ? document.querySelector('#canvas') : null;
const qsphereContainer = typeof document !== 'undefined' ? document.getElementById('container') : null;
const controlsContainer = typeof document !== 'undefined' ? document.getElementById('controls') : null;

let rotationAngles = [0.3, 0.0, 0.0];
let currentMode = 'statevector';
let lastParsedResult = null;
let threeState = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let currentLatexString = '|\\psi\\rangle = |0\\rangle';

function drawPhaseLegend() {
    const verticalCanvases = document.querySelectorAll('.phase-bar-canvas');
    verticalCanvases.forEach(c => {
        const context = c.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, c.width, c.height);
        drawPhaseLegendToCanvas(context, {
            width: c.width,
            height: c.height,
            orientation: 'vertical'
        });
    });

    const horizontalCanvases = document.querySelectorAll('.phase-horizontal-bar-canvas');
    horizontalCanvases.forEach(c => {
        const context = c.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, c.width, c.height);
        drawPhaseLegendToCanvas(context, {
            width: c.width,
            height: c.height,
            orientation: 'horizontal'
        });
    });
}

function updateModeTabs() {
    document.body.dataset.visualizationMode = currentMode;
    document.querySelectorAll('.view-tab').forEach(tab => {
        const isActive = tab.dataset.viewMode === currentMode;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
    });
}

function setVisualizationMode(mode) {
    if (!getVisualization(mode) || mode === currentMode) return;

    const prevViz = getVisualization(currentMode);
    if (prevViz?.unmount) {
        prevViz.unmount();
    }

    currentMode = mode;
    updateModeTabs();

    const nextViz = getVisualization(mode);
    if (nextViz?.mount) {
        nextViz.mount(null, { threeState, canvas });
    }

    if (lastParsedResult) {
        nextViz?.update(lastParsedResult);
    }

    if (threeState) {
        resizeRenderer(threeState);
        renderScene();
    }
}

function initThreeRenderer() {
    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        45,
        (canvas.clientWidth || 270) / (canvas.clientHeight || 270),
        0.1,
        100
    );
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const sphereMaterial = createSphereMaterial();
    const lineMaterial = createLineMaterial();

    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMaterial);
    scene.add(sphereMesh);

    const wireframe = createSphereWireframe(lineMaterial);
    scene.add(wireframe);

    const arrowGroup = new THREE.Group();
    arrowGroup.visible = false;
    scene.add(arrowGroup);

    const qsphereGroup = new THREE.Group();
    qsphereGroup.visible = false;
    scene.add(qsphereGroup);

    return {
        renderer,
        scene,
        camera,
        sphereMesh,
        wireframe,
        arrowGroup,
        qsphereGroup,
        lineMaterial
    };
}

function resizeRenderer(state) {
    if (!state) return;
    const width = canvas.clientWidth || 270;
    const height = canvas.clientHeight || 270;
    if (canvas.width !== width || canvas.height !== height) {
        state.renderer.setSize(width, height, false);
        state.camera.aspect = width / height;
        state.camera.updateProjectionMatrix();
    }
}

function renderScene() {
    if (!threeState) return;
    threeState.renderer.render(threeState.scene, threeState.camera);
}

let pendingCode = null;
let currentFileName = null;

function isPythonFile(fileName) {
    return typeof fileName === 'string' && fileName.endsWith('.py');
}

function isQasmFile(fileName) {
    return typeof fileName === 'string' && (fileName.endsWith('.qasm') || fileName.endsWith('.openqasm'));
}

async function executeParser(code, targetOp, targetLine, fileName) {
    if (isQasmFile(fileName)) {
        return simulateOpenQasm(code, targetLine, fileName);
    }
    if (isPythonFile(fileName) && typeof parseQiskit === 'function') {
        return parseQiskit(code, targetLine);
    }
    return parseQSharp(code, targetOp, targetLine);
}

async function initScene() {
    const testQsUri = canvas.dataset.testQs || 'samples/test.qs';

    if (pendingCode) {
        try {
            const result = await executeParser(pendingCode, null, undefined, currentFileName);
            lastParsedResult = result;
        } catch (e) {
            console.warn('Could not parse pending code:', e);
        }
    }

    if (!lastParsedResult) {
        try {
            const response = await fetch(testQsUri);
            if (response.ok) {
                const code = await response.text();
                const result = await parseQSharp(code);
                lastParsedResult = result;
            }
        } catch (e) {
            console.warn('Could not fetch initial Q# file:', e);
        }
    }

    const state = initThreeRenderer();

    const projMatrix = mult(
        createPerspectiveMatrix(Math.PI / 4, (canvas.clientWidth || 270) / (canvas.clientHeight || 270), 0.1, 100),
        createTranslationMatrix(0, 0, -3)
    );
    state._projMatrix = projMatrix;
    state._buildProjMatrix = function () {
        return mult(
            createPerspectiveMatrix(Math.PI / 4, (canvas.clientWidth || 270) / (canvas.clientHeight || 270), 0.1, 100),
            createTranslationMatrix(0, 0, -3)
        );
    };

    const activeViz = getVisualization(currentMode);
    if (activeViz?.mount) {
        activeViz.mount(null, { threeState: state, canvas });
    }

    return state;
}

// Mouse interaction for 3D sphere rotation and hover
if (canvas) {
    canvas.addEventListener('mousedown', e => {
        isDragging = true;
        const activeViz = getVisualization(currentMode);
        if (activeViz?.clearHover) activeViz.clearHover();
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', e => {
        if (currentMode !== 'qsphere') return;

        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            rotationAngles[0] += deltaY * 0.005;
            rotationAngles[0] = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationAngles[0]));
            rotationAngles[1] += deltaX * 0.005;

            previousMousePosition = { x: e.clientX, y: e.clientY };
        } else {
            const activeViz = getVisualization(currentMode);
            if (activeViz?.updateHover) {
                activeViz.updateHover(e, canvas, rotationAngles);
            }
        }
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
        const activeViz = getVisualization(currentMode);
        if (activeViz?.clearHover) activeViz.clearHover();
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('mouseup', () => {
        isDragging = false;
    });
    window.rotationAngles = rotationAngles;
}

if (typeof document !== 'undefined') {
    // View tabs event listener
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => setVisualizationMode(tab.dataset.viewMode));
    });
    updateModeTabs();
    drawPhaseLegend();
}

let isLiveUpdate = true;
let pendingLiveUpdate = null;

// Live button event listener
const liveBtn = typeof document !== 'undefined' ? document.getElementById('live-btn') : null;
if (liveBtn) {
    liveBtn.addEventListener('click', () => {
        setLiveUpdate(!isLiveUpdate);
    });
}

function setLiveUpdate(enabled) {
    isLiveUpdate = Boolean(enabled);
    if (liveBtn) {
        liveBtn.classList.toggle('active', isLiveUpdate);
        liveBtn.setAttribute('aria-pressed', String(isLiveUpdate));
        liveBtn.title = isLiveUpdate ? 'Live updates active (click to pause)' : 'Live updates paused (click to resume)';
    }
    if (isLiveUpdate && pendingLiveUpdate) {
        const update = pendingLiveUpdate;
        pendingLiveUpdate = null;
        applyParsedUpdate(update.code, update.targetOp, undefined, update.fileName);
    }
}

function getIsLiveUpdate() {
    return isLiveUpdate;
}

function checkAutoDeactivateLive(resultOrQubits) {
    let N = 0;
    if (typeof resultOrQubits === 'number') {
        N = resultOrQubits;
    } else if (resultOrQubits) {
        const qstate = getQsphereState(resultOrQubits);
        N = qstate?.N || resultOrQubits?.qubitsDeclared || 0;
    }
    if (N >= 5 && isLiveUpdate) {
        setLiveUpdate(false);
        return true;
    }
    return false;
}

function updateLatexDisplay(result) {
    const latexString = formatQuantumStateKaTeX(result, { includeStateSymbol: true });
    currentLatexString = latexString;

    if (typeof document === 'undefined') return currentLatexString;
    const latexFormula = document.getElementById('latex-formula');
    if (!latexFormula) return currentLatexString;

    try {
        if (katex && typeof katex.renderToString === 'function') {
            latexFormula.innerHTML = katex.renderToString(latexString, {
                throwOnError: false,
                displayMode: false
            });
        } else {
            latexFormula.textContent = latexString;
        }
    } catch (e) {
        latexFormula.textContent = latexString;
    }
    return currentLatexString;
}

function getCurrentLatexString() {
    return currentLatexString;
}

const COPY_SVG = '<svg class="action-icon copy-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.5H11.5C12.0523 3.5 12.5 3.94772 12.5 4.5V12.5C12.5 13.0523 12.0523 13.5 11.5 13.5H5.5C4.94772 13.5 4.5 13.0523 4.5 12.5V4.5C4.5 3.94772 4.94772 3.5 5.5 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 10.5H2.5C1.94772 10.5 1.5 10.0523 1.5 9.5V2.5C1.5 1.94772 1.94772 1.5 2.5 1.5H9.5C10.0523 1.5 10.5 1.94772 10.5 2.5V3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK_SVG = '<svg class="action-icon check-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Copy LaTeX button event listener
const copyLatexBtn = typeof document !== 'undefined' ? document.getElementById('copy-latex-btn') : null;
if (copyLatexBtn) {
    copyLatexBtn.addEventListener('click', async () => {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(currentLatexString);
            }
            if (vscode) {
                vscode.postMessage({
                    command: 'copyToClipboard',
                    text: currentLatexString
                });
            }
            copyLatexBtn.classList.add('copied');
            copyLatexBtn.innerHTML = CHECK_SVG;
            copyLatexBtn.title = 'Copied!';
            setTimeout(() => {
                copyLatexBtn.classList.remove('copied');
                copyLatexBtn.innerHTML = COPY_SVG;
                copyLatexBtn.title = 'Copy state as LaTeX';
            }, 1600);
        } catch (err) {
            console.error('Copy LaTeX failed:', err);
        }
    });
}

// Export button event listener
const exportBtn = typeof document !== 'undefined' ? document.getElementById('export-btn') : null;
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        const activeViz = getVisualization(currentMode);
        if (!activeViz?.export) return;

        exportBtn.disabled = true;
        const labelSpan = exportBtn.querySelector('span');
        const originalText = labelSpan?.textContent || 'Export';
        if (labelSpan) labelSpan.textContent = 'Exporting...';

        try {
            const result = await activeViz.export({ threeState, canvas });
            if (result && vscode) {
                vscode.postMessage({
                    command: 'exportFiles',
                    data: {
                        name: result.filenamePrefix || currentMode,
                        pngDataUrl: result.pngDataUrl,
                        svgContent: result.svgContent,
                        files: result.files
                    }
                });
            }
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            exportBtn.disabled = false;
            if (labelSpan) labelSpan.textContent = originalText;
        }
    });
}

function frame() {
    const activeViz = getVisualization(currentMode);
    if (activeViz?.animate) {
        activeViz.animate(0.20);
    }

    if (threeState && currentMode === 'qsphere') {
        threeState.scene.rotation.set(rotationAngles[0], rotationAngles[1], rotationAngles[2]);
        const modelMatrix = rotateMatrix(...rotationAngles, threeState._projMatrix);
        const rect = canvas.getBoundingClientRect();
        if (activeViz?.updateLabels) {
            activeViz.updateLabels(modelMatrix, rect.width, rect.height);
        }
        try {
            renderScene();
        } catch (e) {}
    }

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(frame);
    }
}

let currentTargetOp = null;

async function applyParsedUpdate(code, targetOp, targetLine, fileName) {
    if (!code) return;
    if (targetOp !== undefined) {
        currentTargetOp = targetOp;
    }
    if (fileName !== undefined) {
        currentFileName = fileName;
    }
    try {
        const result = await executeParser(code, currentTargetOp, targetLine, currentFileName);
        const lang = isQasmFile(currentFileName) ? 'OpenQASM' : (isPythonFile(currentFileName) ? 'Qiskit' : 'Q#');
        if (targetLine !== undefined) {
            console.log(lang + ' Inspected Line Result (line ' + (targetLine + 1) + '):', result);
        } else {
            console.log(lang + ' Parse Result:', result);
        }
        lastParsedResult = result;
        updateLatexDisplay(result);
        checkAutoDeactivateLive(result);

        const activeViz = getVisualization(currentMode);
        if (activeViz) {
            try {
                activeViz.update(result);
            } catch (e) {
                console.warn('Error updating visualization:', e);
            }
        }

        if (threeState && currentMode === 'qsphere') {
            try {
                renderScene();
            } catch (e) {}
        }
    } catch (err) {
        console.warn('Error applying parsed update:', err);
    }
}

if (canvas) {
    initScene()
        .then(state => {
            threeState = state;
            const activeViz = getVisualization(currentMode);
            if (activeViz?.mount) {
                activeViz.mount(null, { threeState, canvas });
            }
            if (lastParsedResult) {
                updateLatexDisplay(lastParsedResult);
                try {
                    activeViz?.update(lastParsedResult);
                } catch (e) {
                    console.warn('Error updating active visualization:', e);
                }
            } else {
                updateLatexDisplay(null);
            }
            if (vscode) {
                vscode.postMessage({ command: 'ready' });
            }
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(frame);
            }
        })
        .catch(error => {
            console.error('Three.js renderer setup failed:', error);
        });
}

if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        resizeRenderer(threeState);
        if (threeState) {
            threeState._projMatrix = threeState._buildProjMatrix();
            try {
                renderScene();
            } catch (e) {}
        }
        const activeViz = getVisualization(currentMode);
        if (activeViz?.resize) {
            activeViz.resize();
        }
    });

    window.addEventListener('message', async event => {
        const message = event.data;
        if (message.command === 'replayAnimation') {
            const activeViz = getVisualization(currentMode);
            if (activeViz?.replayAnimation) {
                activeViz.replayAnimation();
            } else {
                for (const viz of getAllVisualizations()) {
                    if (viz.replayAnimation) viz.replayAnimation();
                }
            }
            return;
        }
        if (message.command === 'inspectLine') {
            if (message.data && message.data.code) {
                await applyParsedUpdate(message.data.code, message.data.targetOp, message.data.targetLine, message.data.fileName);
            }
            return;
        }
        if (message.command === 'init') {
            if (message.data && message.data.code) {
                await applyParsedUpdate(message.data.code, message.data.targetOp, undefined, message.data.fileName);
            }
            return;
        }
        if (message.command === 'update') {
            if (message.data && message.data.code) {
                if (isLiveUpdate) {
                    await applyParsedUpdate(message.data.code, message.data.targetOp, undefined, message.data.fileName);
                } else {
                    pendingLiveUpdate = { code: message.data.code, targetOp: message.data.targetOp, fileName: message.data.fileName };
                }
            }
        }
    });
}

export {
    getVisualization,
    getAllVisualizations,
    registerVisualization,
    setVisualizationMode,
    currentMode,
    setLiveUpdate,
    getIsLiveUpdate,
    checkAutoDeactivateLive,
    updateLatexDisplay,
    getCurrentLatexString
};

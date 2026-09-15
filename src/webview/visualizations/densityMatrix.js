import * as THREE from 'three';
import {
    getQsphereState,
    formatBasisState,
    formatPhasePi,
    stepStatevectorTransition,
    rotateMatrix
} from '../math/index.js';
import { getOrCreateHoverTooltip } from '../render/hoverTooltip.js';

let densityContainer = null;
let realCanvas2D = null;
let imagCanvas2D = null;
let realCanvas3D = null;
let imagCanvas3D = null;
let realLabels3D = null;
let imagLabels3D = null;
let panels2D = null;
let panels3D = null;
let legendCanvas = null;
let densityStats = null;
let densityPanelsWrapper = null;
let densityHoverInfo = null;
let toggleBtns = [];

let currentAmplitudes = [];
let targetAmplitudes = [];
let currentQubits = 0;
let targetQubits = 0;
let isTransitioning = false;
let hoveredCell = null; // { panel: 'real'|'imag', row: number, col: number }
let isInitialized = false;
let lastResult = null;
let densityMode = '2d'; // '2d' | '3d'

// 3D Three.js scene states
let threeReal = null;
let threeImag = null;
const rotation3D = [0.55, -0.65, 0.0]; // Synchronized rotation: pitch, yaw, roll

/**
 * Computes the density matrix elements rho_ij = c_i * conj(c_j)
 * @param {Array<{re: number, im: number}>} amplitudes
 * @param {number} N
 * @returns {Array<Array<{re: number, im: number, mag: number, phase: number}>>}
 */
export function computeDensityMatrix(amplitudes, N) {
    const numStates = 2 ** N;
    const matrix = [];

    for (let i = 0; i < numStates; i++) {
        const row = [];
        const ci = amplitudes[i] || { re: 0, im: 0 };
        for (let j = 0; j < numStates; j++) {
            const cj = amplitudes[j] || { re: 0, im: 0 };
            const re = ci.re * cj.re + ci.im * cj.im;
            const im = ci.im * cj.re - ci.re * cj.im;
            const mag = Math.sqrt(re * re + im * im);
            const phase = Math.atan2(im, re);
            row.push({ re, im, mag, phase });
        }
        matrix.push(row);
    }
    return matrix;
}

/**
 * Maps a scalar value in [-1, 1] to a diverging Blue-White-Red RGB color.
 * @param {number} val
 * @returns {[number, number, number]} RGB values in [0, 255]
 */
export function getBwrColorRgb(val) {
    const clamped = Math.max(-1, Math.min(1, Number.isFinite(val) ? val : 0));

    if (clamped > 0) {
        const t = clamped;
        const r = Math.round(255 - t * (255 - 235));
        const g = Math.round(255 - t * (255 - 60));
        const b = Math.round(255 - t * (255 - 60));
        return [r, g, b];
    }

    if (clamped < 0) {
        const t = -clamped;
        const r = Math.round(255 - t * (255 - 55));
        const g = Math.round(255 - t * (255 - 125));
        const b = Math.round(255 - t * (255 - 245));
        return [r, g, b];
    }

    return [255, 255, 255];
}

export function getBwrColor(val) {
    const [r, g, b] = getBwrColorRgb(val);
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Computes responsive layout geometry for a single 2D heatmap panel.
 */
export function computeHeatmapLayout(numStates, availablePanelWidth = 360) {
    const isRotated = numStates > 4;
    const labelMarginLeft = numStates > 8 ? 64 : (numStates > 4 ? 48 : 40);
    const labelMarginTop = isRotated ? 44 : 32;
    const titleHeight = 24;
    const paddingBottom = 16;
    const paddingRight = 16;

    const maxGridSize = Math.max(160, availablePanelWidth - labelMarginLeft - paddingRight);
    const cellSize = numStates > 0 ? Math.max(14, Math.min(140, Math.floor(maxGridSize / numStates))) : 24;
    const gridSize = cellSize * numStates;
    const totalWidth = labelMarginLeft + gridSize + paddingRight;
    const totalHeight = titleHeight + labelMarginTop + gridSize + paddingBottom;

    return { labelMarginLeft, labelMarginTop, titleHeight, paddingBottom, paddingRight, cellSize, gridSize, totalWidth, totalHeight, isRotated };
}

function initDensityElements(elements = {}) {
    if (typeof document === 'undefined') return;
    densityContainer = elements.container || document.getElementById('densitymatrix-container');
    realCanvas2D = elements.realCanvas || document.getElementById('densitymatrix-real-canvas');
    imagCanvas2D = elements.imagCanvas || document.getElementById('densitymatrix-imag-canvas');
    realCanvas3D = document.getElementById('densitymatrix-real-3d-canvas');
    imagCanvas3D = document.getElementById('densitymatrix-imag-3d-canvas');
    realLabels3D = document.getElementById('densitymatrix-real-3d-labels');
    imagLabels3D = document.getElementById('densitymatrix-imag-3d-labels');
    panels2D = document.getElementById('densitymatrix-panels-2d');
    panels3D = document.getElementById('densitymatrix-panels-3d');
    legendCanvas = elements.legendCanvas || document.getElementById('densitymatrix-legend-canvas');
    densityStats = elements.stats || document.getElementById('densitymatrix-stats');
    densityPanelsWrapper = elements.panelsWrapper || panels2D;

    toggleBtns = Array.from(document.querySelectorAll('.density-toggle-btn'));

    if (!isInitialized) {
        setupDensityEvents();
        setupToggleEvents();
        init3DScenes();
        isInitialized = true;
    }
}

function setupToggleEvents() {
    for (const btn of toggleBtns) {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.densityMode;
            if (mode && mode !== densityMode) {
                setDensityMode(mode);
            }
        });
    }
}

function setDensityMode(mode) {
    if (mode !== '2d' && mode !== '3d') return;
    densityMode = mode;

    for (const btn of toggleBtns) {
        btn.classList.toggle('active', btn.dataset.densityMode === mode);
    }

    if (panels2D) panels2D.style.display = mode === '2d' ? 'flex' : 'none';
    if (panels3D) panels3D.style.display = mode === '3d' ? 'flex' : 'none';

    if (mode === '3d') {
        resize3DRenderers();
        update3DScenes(currentAmplitudes, currentQubits);
        render3DScenes();
    } else {
        drawDensityMatrixWithAmplitudes(currentAmplitudes, currentQubits);
    }
}

function getDensityMode() {
    return densityMode;
}

function getDensityHoverInfo() {
    if (!densityContainer) return null;
    densityHoverInfo = getOrCreateHoverTooltip(densityContainer, 'statevector-hover-info', densityHoverInfo);
    return densityHoverInfo;
}

function handleCanvasMouseMove2D(canvas, panelType, event, numStates, layout) {
    if (document.body?.dataset.visualizationMode !== 'densitymatrix' || numStates === 0 || densityMode !== '2d') return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const gridX = mouseX - layout.labelMarginLeft;
    const gridY = mouseY - (layout.titleHeight + layout.labelMarginTop);

    if (gridX >= 0 && gridX < layout.gridSize && gridY >= 0 && gridY < layout.gridSize) {
        const col = Math.floor(gridX / layout.cellSize);
        const row = Math.floor(gridY / layout.cellSize);

        if (row >= 0 && row < numStates && col >= 0 && col < numStates) {
            hoveredCell = { panel: panelType, row, col };
            showTooltipForCell(row, col, event);
            return;
        }
    }

    hoveredCell = null;
    const hoverInfo = getDensityHoverInfo();
    if (hoverInfo) hoverInfo.hidden = true;
}

function showTooltipForCell(row, col, event) {
    const matrix = computeDensityMatrix(currentAmplitudes, currentQubits);
    const cellData = matrix[row]?.[col] || { re: 0, im: 0, mag: 0, phase: 0 };

    const hoverInfo = getDensityHoverInfo();
    if (hoverInfo && densityContainer) {
        const rowLabel = formatBasisState(row, currentQubits);
        const colLabel = formatBasisState(col, currentQubits);
        const phaseDeg = (((cellData.phase * 180 / Math.PI) % 360) + 360) % 360;

        hoverInfo.innerHTML =
            `<strong>ρ<sub>${rowLabel},${colLabel}</sub></strong> (Row ${rowLabel}, Col ${colLabel})<br>` +
            `Real Part: ${cellData.re >= 0 ? '+' : ''}${cellData.re.toFixed(4)}<br>` +
            `Imag Part: ${cellData.im >= 0 ? '+' : ''}${cellData.im.toFixed(4)}<br>` +
            `Magnitude: ${cellData.mag.toFixed(4)}<br>` +
            `Phase: ${phaseDeg.toFixed(1)}° (${formatPhasePi(cellData.phase)})`;

        const containerRect = densityContainer.getBoundingClientRect();
        const posX = event.clientX - containerRect.left + 12;
        const posY = event.clientY - containerRect.top + 12;

        hoverInfo.style.left = `${Math.min(containerRect.width - 160, Math.max(8, posX))}px`;
        hoverInfo.style.top = `${Math.min(containerRect.height - 90, Math.max(8, posY))}px`;
        hoverInfo.hidden = false;
    }
}

function getAvailablePanelWidth() {
    const containerWidth = densityContainer?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 600) || 600;
    const halfWidth = Math.floor((containerWidth - 32) / 2);
    return Math.min(360, Math.max(160, halfWidth));
}

function setupDensityEvents() {
    if (realCanvas2D && imagCanvas2D) {
        const onLeave = () => {
            hoveredCell = null;
            const hoverInfo = getDensityHoverInfo();
            if (hoverInfo) hoverInfo.hidden = true;
        };

        realCanvas2D.addEventListener('mousemove', e => {
            const numStates = 2 ** currentQubits;
            const panelWidth = getAvailablePanelWidth();
            const layout = computeHeatmapLayout(numStates, panelWidth);
            handleCanvasMouseMove2D(realCanvas2D, 'real', e, numStates, layout);
        });

        imagCanvas2D.addEventListener('mousemove', e => {
            const numStates = 2 ** currentQubits;
            const panelWidth = getAvailablePanelWidth();
            const layout = computeHeatmapLayout(numStates, panelWidth);
            handleCanvasMouseMove2D(imagCanvas2D, 'imag', e, numStates, layout);
        });

        realCanvas2D.addEventListener('mouseleave', onLeave);
        imagCanvas2D.addEventListener('mouseleave', onLeave);
    }
}

function createSingle3DScene(canvasElement, isReal) {
    if (!canvasElement) return null;

    const width = canvasElement.clientWidth || 340;
    const height = canvasElement.clientHeight || 320;

    const renderer = new THREE.WebGLRenderer({
        canvas: canvasElement,
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3.8, 5.0);
    camera.lookAt(0, 0.1, 0);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.15);
    dirLight.position.set(5, 12, 8);
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x90b0e0, 0.45);
    backLight.position.set(-5, -6, -8);
    scene.add(backLight);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambLight);

    const plotGroup = new THREE.Group();
    scene.add(plotGroup);

    const barGroup = new THREE.Group();
    plotGroup.add(barGroup);

    const gridGroup = new THREE.Group();
    plotGroup.add(gridGroup);

    const labelGroup = new THREE.Group();
    plotGroup.add(labelGroup);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    canvasElement.addEventListener('mousedown', e => {
        isDragging = true;
        prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const dx = e.clientX - prevMouse.x;
        const dy = e.clientY - prevMouse.y;

        rotation3D[1] += dx * 0.006;
        rotation3D[0] += dy * 0.006;
        rotation3D[0] = Math.max(-1.15, Math.min(1.15, rotation3D[0]));

        prevMouse = { x: e.clientX, y: e.clientY };
        render3DScenes();
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    canvasElement.addEventListener('mousemove', e => {
        if (isDragging) return;
        handle3DMouseMove(canvasElement, scene, camera, raycaster, mouse, isReal, e);
    });

    canvasElement.addEventListener('mouseleave', () => {
        const hoverInfo = getDensityHoverInfo();
        if (hoverInfo) hoverInfo.hidden = true;
    });

    return {
        canvas: canvasElement,
        renderer,
        scene,
        camera,
        plotGroup,
        barGroup,
        gridGroup,
        labelGroup,
        isReal,
        labelData: []
    };
}

function init3DScenes() {
    if (typeof document === 'undefined') return;
    if (realCanvas3D && !threeReal) {
        threeReal = createSingle3DScene(realCanvas3D, true);
    }
    if (imagCanvas3D && !threeImag) {
        threeImag = createSingle3DScene(imagCanvas3D, false);
    }
}

function handle3DMouseMove(canvas, scene, camera, raycaster, mouse, isReal, event) {
    if (densityMode !== '3d') return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersects) {
        if (hit.object?.userData?.isInstancedBars) {
            const numStates = hit.object.userData.numStates;
            const instanceId = hit.instanceId;
            if (instanceId !== undefined && instanceId !== null && instanceId >= 0) {
                const row = Math.floor(instanceId / numStates);
                const col = instanceId % numStates;
                showTooltipForCell(row, col, event);
                return;
            }
        }
        let obj = hit.object;
        while (obj && !obj.userData?.isBar && obj.parent) {
            obj = obj.parent;
        }
        if (obj?.userData?.isBar) {
            const { row, col } = obj.userData;
            showTooltipForCell(row, col, event);
            return;
        }
    }

    const hoverInfo = getDensityHoverInfo();
    if (hoverInfo) hoverInfo.hidden = true;
}

function resize3DRenderers(layout) {
    const numStates = 2 ** currentQubits;
    const panelWidth = getAvailablePanelWidth();
    const curLayout = layout || computeHeatmapLayout(numStates, panelWidth);

    const width = curLayout.totalWidth;
    const height = Math.max(120, curLayout.totalHeight - curLayout.titleHeight);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    for (const inst of [threeReal, threeImag]) {
        if (!inst || !inst.canvas) continue;
        inst.canvas.style.width = `${width}px`;
        inst.canvas.style.height = `${height}px`;
        inst.canvas.width = Math.floor(width * dpr);
        inst.canvas.height = Math.floor(height * dpr);
        if (inst.canvas.parentElement) {
            inst.canvas.parentElement.style.width = `${width}px`;
            inst.canvas.parentElement.style.height = `${height}px`;
        }
        if (inst.canvas.parentElement?.parentElement) {
            inst.canvas.parentElement.parentElement.style.width = `${width}px`;
        }

        inst.renderer.setSize(width, height, false);
        inst.renderer.setPixelRatio(dpr);
        inst.camera.aspect = width / height;
        inst.camera.updateProjectionMatrix();
    }
}

function update3DScenes(amplitudes, N) {
    if (!threeReal && !threeImag) return;
    const numStates = 2 ** N;
    const matrix = computeDensityMatrix(amplitudes, N);

    const panelWidth = getAvailablePanelWidth();
    const layout = computeHeatmapLayout(numStates, panelWidth);
    resize3DRenderers(layout);

    if (threeReal) updateSingle3DScene(threeReal, matrix, numStates, N, true, realLabels3D);
    if (threeImag) updateSingle3DScene(threeImag, matrix, numStates, N, false, imagLabels3D);
}

/**
 * Computes 3D position coordinates for basis state labels along column and row axes.
 * @param {number} numStates
 * @param {number} N
 * @returns {{ colLabels: Array<{ ket: string, pos: [number, number, number] }>, rowLabels: Array<{ ket: string, pos: [number, number, number] }>, spacing: number, halfGrid: number, spriteHeight: number }}
 */
function compute3DLabelPositions(numStates, N) {
    if (numStates <= 0) return { colLabels: [], rowLabels: [], spacing: 0, halfGrid: 0, spriteHeight: 0 };
    const spacing = Math.min(0.55, 2.5 / numStates);
    const gridTotal = numStates * spacing;
    const halfGrid = gridTotal / 2;
    const spriteHeight = Math.min(0.38, Math.max(0.20, spacing * 0.75));
    const y = spriteHeight * 0.40;

    const colLabels = [];
    for (let j = 0; j < numStates; j++) {
        const x = -halfGrid + j * spacing + spacing / 2;
        const z = halfGrid + spriteHeight * 0.5 + 0.08;
        const ket = formatBasisState(j, N);
        colLabels.push({ ket, pos: [x, y, z] });
    }

    const rowLabels = [];
    for (let i = 0; i < numStates; i++) {
        const x = -halfGrid - 0.10;
        const z = -halfGrid + i * spacing + spacing / 2;
        const ket = formatBasisState(i, N);
        rowLabels.push({ ket, pos: [x, y, z] });
    }

    return { colLabels, rowLabels, spacing, halfGrid, spriteHeight };
}

/**
 * Creates a Three.js Sprite for a basis state label with high-DPI text and depth testing.
 * @param {string} text
 * @param {number} spacing
 * @param {'center'|'right'} [align='center']
 * @returns {THREE.Sprite | null}
 */
function createLabelSprite(text, spacing, align = 'center') {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const fontPx = 48;
    ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);
    const textHeight = fontPx;

    const padX = 8;
    const padY = 4;
    canvas.width = textWidth + padX * 2;
    canvas.height = textHeight + padY * 2;

    ctx.font = `600 ${fontPx}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = 'rgba(230, 230, 238, 0.92)';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.renderOrder = 2;
    if (align === 'right') {
        sprite.center.set(1.0, 0.5);
    } else {
        sprite.center.set(0.5, 0.5);
    }

    const aspect = canvas.width / canvas.height;
    const spriteHeight = Math.min(0.38, Math.max(0.20, spacing * 0.75));
    const spriteWidth = spriteHeight * aspect;
    sprite.scale.set(spriteWidth, spriteHeight, 1);
    sprite.raycast = () => {}; // Ignore raycasting hits so tooltip hover is never blocked
    return sprite;
}

function updateSingle3DScene(inst, matrix, numStates, N, isReal, labelsDiv) {
    const { barGroup, gridGroup, labelGroup } = inst;

    while (barGroup.children.length > 0) {
        const child = barGroup.children[0];
        barGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    }

    while (gridGroup.children.length > 0) {
        const child = gridGroup.children[0];
        gridGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }

    if (labelGroup) {
        while (labelGroup.children.length > 0) {
            const child = labelGroup.children[0];
            labelGroup.remove(child);
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
            if (child.geometry) child.geometry.dispose();
        }
    }

    inst.labelData = [];
    if (labelsDiv) labelsDiv.innerHTML = '';

    if (numStates === 0) return;

    const spacing = Math.min(0.55, 2.5 / numStates);
    const barSize = spacing * 0.76;
    const maxHeight = 1.8;
    const gridTotal = numStates * spacing;
    const halfGrid = gridTotal / 2;

    const baseGeo = new THREE.PlaneGeometry(gridTotal, gridTotal);
    baseGeo.rotateX(-Math.PI / 2);
    const baseMat = new THREE.MeshBasicMaterial({
        color: 0x1f2438,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.renderOrder = 0;
    gridGroup.add(baseMesh);

    const gridLines = [];
    for (let i = 0; i <= numStates; i++) {
        const pos = -halfGrid + i * spacing;
        gridLines.push(-halfGrid, 0, pos, halfGrid, 0, pos);
        gridLines.push(pos, 0, -halfGrid, pos, 0, halfGrid);
    }
    const gridLineGeo = new THREE.BufferGeometry();
    gridLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridLines, 3));
    const gridLineMat = new THREE.LineBasicMaterial({
        color: 0x4a5568,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
    });
    const gridLineMesh = new THREE.LineSegments(gridLineGeo, gridLineMat);
    gridLineMesh.renderOrder = 1;
    gridGroup.add(gridLineMesh);

    const borderLines = [
        -halfGrid, -maxHeight, -halfGrid, -halfGrid, maxHeight, -halfGrid,
        -halfGrid, 0, -halfGrid, halfGrid, 0, -halfGrid,
        -halfGrid, 0, -halfGrid, -halfGrid, 0, halfGrid
    ];
    const borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderLines, 3));
    const borderMat = new THREE.LineBasicMaterial({
        color: 0x718096,
        transparent: true,
        opacity: 0.6,
        depthWrite: false
    });
    const borderMesh = new THREE.LineSegments(borderGeo, borderMat);
    borderMesh.renderOrder = 1;
    gridGroup.add(borderMesh);

    const totalInstances = numStates * numStates;
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const instancedMat = new THREE.MeshLambertMaterial({
        color: 0xffffff
    });
    const instancedMesh = new THREE.InstancedMesh(unitBoxGeo, instancedMat, totalInstances);
    instancedMesh.userData = { isInstancedBars: true, numStates };
    instancedMesh.renderOrder = 2;

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    for (let i = 0; i < numStates; i++) {
        for (let j = 0; j < numStates; j++) {
            const idx = i * numStates + j;
            const cell = matrix[i]?.[j] || { re: 0, im: 0 };
            const val = isReal ? cell.re : cell.im;
            const mag = Math.abs(val);

            const x = -halfGrid + j * spacing + spacing / 2;
            const z = -halfGrid + i * spacing + spacing / 2;

            if (mag < 1e-4) {
                dummy.position.set(x, 0.01, z);
                dummy.scale.set(barSize, 0.02, barSize);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(idx, dummy.matrix);
                tempColor.setRGB(1, 1, 1);
                instancedMesh.setColorAt(idx, tempColor);
            } else {
                const h = Math.max(0.04, mag * maxHeight);
                const centerY = val >= 0 ? h / 2 : -h / 2;
                dummy.position.set(x, centerY, z);
                dummy.scale.set(barSize, h, barSize);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(idx, dummy.matrix);

                const [r, g, b] = getBwrColorRgb(val);
                tempColor.setRGB(r / 255, g / 255, b / 255);
                instancedMesh.setColorAt(idx, tempColor);
            }
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
    }
    barGroup.add(instancedMesh);

    const { colLabels, rowLabels } = compute3DLabelPositions(numStates, N);

    if (labelGroup) {
        for (const item of colLabels) {
            const sprite = createLabelSprite(item.ket, spacing, 'center');
            if (sprite) {
                sprite.position.set(item.pos[0], item.pos[1], item.pos[2]);
                labelGroup.add(sprite);
            }
        }

        for (const item of rowLabels) {
            const sprite = createLabelSprite(item.ket, spacing, 'right');
            if (sprite) {
                sprite.position.set(item.pos[0], item.pos[1], item.pos[2]);
                labelGroup.add(sprite);
            }
        }
    }
}

function render3DScenes() {
    if (densityMode !== '3d') return;
    for (const inst of [threeReal, threeImag]) {
        if (!inst) continue;
        inst.plotGroup.rotation.set(rotation3D[0], rotation3D[1], rotation3D[2]);
        try {
            inst.renderer.render(inst.scene, inst.camera);
        } catch (e) {}
    }
}

function update3DLabels(inst) {
    // State labels are rendered natively in WebGL with depth testing via Three.js Sprites
}

function project3DPoint(pos, camera, width, height) {
    const v = new THREE.Vector3(pos[0], pos[1], pos[2]);
    v.applyEuler(new THREE.Euler(rotation3D[0], rotation3D[1], rotation3D[2], 'XYZ'));
    v.project(camera);

    if (v.z > 1.0) return null;

    const screenX = (v.x * 0.5 + 0.5) * width;
    const screenY = (-v.y * 0.5 + 0.5) * height;
    return [screenX, screenY];
}

function drawHeatmapToContext(ctx, options) {
    const { matrix, numStates, N, title, layout, dpr = 1 } = options;
    const { labelMarginLeft, labelMarginTop, titleHeight, cellSize, gridSize, totalWidth, totalHeight, isRotated } = layout;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, totalHeight);

    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#e6e6ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, totalWidth / 2, titleHeight / 2);

    const startX = labelMarginLeft;
    const startY = titleHeight + labelMarginTop;

    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#e0e0e0';

    for (let j = 0; j < numStates; j++) {
        const colText = formatBasisState(j, N);
        const colCenterX = startX + j * cellSize + cellSize / 2;
        if (isRotated) {
            ctx.save();
            ctx.translate(colCenterX, startY - 8);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(colText, 0, 0);
            ctx.restore();
        } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(colText, colCenterX, startY - 6);
        }
    }

    for (let i = 0; i < numStates; i++) {
        const rowText = formatBasisState(i, N);
        const rowCenterY = startY + i * cellSize + cellSize / 2;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowText, startX - 8, rowCenterY);

        for (let j = 0; j < numStates; j++) {
            const cellX = startX + j * cellSize;
            const cellY = startY + i * cellSize;
            const cell = matrix[i]?.[j] || { re: 0, im: 0, mag: 0, phase: 0 };
            const val = options.isReal ? cell.re : cell.im;
            ctx.fillStyle = getBwrColor(val);
            ctx.fillRect(cellX, cellY, cellSize, cellSize);
        }
    }

    // Internal grid lines between cells (contrasting dark tone for clear visibility on light/white cells)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < numStates; k++) {
        const x = Math.floor(startX + k * cellSize) + 0.5;
        ctx.moveTo(x, startY);
        ctx.lineTo(x, startY + gridSize);

        const y = Math.floor(startY + k * cellSize) + 0.5;
        ctx.moveTo(startX, y);
        ctx.lineTo(startX + gridSize, y);
    }
    ctx.stroke();

    // Outer border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX + 0.5, startY + 0.5, gridSize, gridSize);

    // Hover cell highlight with high contrast
    if (hoveredCell && hoveredCell.panel === (options.isReal ? 'real' : 'imag')) {
        const { row, col } = hoveredCell;
        if (row >= 0 && row < numStates && col >= 0 && col < numStates) {
            const cellX = startX + col * cellSize;
            const cellY = startY + row * cellSize;
            ctx.save();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(cellX + 0.5, cellY + 0.5, cellSize - 1, cellSize - 1);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cellX + 0.5, cellY + 0.5, cellSize - 1, cellSize - 1);
            ctx.restore();
        }
    }
    ctx.restore();
}

function drawBwrLegendToCanvas(ctx, options) {
    const { x, y, width = 240, height = 10, title, textColor = '#e6e6ee', showTitle = true, showTicks = true } = options;
    ctx.save();
    if (showTitle && title) {
        ctx.font = '600 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(title, x + width / 2, y - 6);
    }
    const grad = ctx.createLinearGradient(x, y, x + width, y);
    grad.addColorStop(0.0, 'rgb(55, 125, 245)');
    grad.addColorStop(0.5, 'rgb(255, 255, 255)');
    grad.addColorStop(1.0, 'rgb(235, 60, 60)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeRect(x, y, width, height);
    if (showTicks) {
        ctx.font = '600 10px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = textColor;
        ctx.textBaseline = 'top';
        const ticks = [
            { label: '-1.0', align: 'left', tx: x },
            { label: '-0.5', align: 'center', tx: x + width * 0.25 },
            { label: '0.0', align: 'center', tx: x + width * 0.5 },
            { label: '+0.5', align: 'center', tx: x + width * 0.75 },
            { label: '+1.0', align: 'right', tx: x + width }
        ];
        for (const t of ticks) {
            ctx.textAlign = t.align;
            ctx.fillText(t.label, t.tx, y + height + 4);
        }
    }
    ctx.restore();
}

function drawDensityMatrixWithAmplitudes(amplitudes, N) {
    initDensityElements();
    const numStates = 2 ** N;
    const matrix = computeDensityMatrix(amplitudes, N);

    let purity = 0;
    for (let i = 0; i < numStates; i++) {
        for (let j = 0; j < numStates; j++) {
            const cell = matrix[i][j];
            purity += cell.re * cell.re + cell.im * cell.im;
        }
    }

    if (densityStats) {
        densityStats.textContent = `Dimension: ${numStates}×${numStates} (${N} Qubit${N === 1 ? '' : 's'}) | Pure State (Tr(ρ²) = ${purity.toFixed(2)})`;
    }

    if (legendCanvas) {
        const legCtx = legendCanvas.getContext('2d');
        if (legCtx) {
            const dpr = window.devicePixelRatio || 1;
            legendCanvas.width = 240 * dpr;
            legendCanvas.height = 10 * dpr;
            legCtx.save();
            legCtx.scale(dpr, dpr);
            const grad = legCtx.createLinearGradient(0, 0, 240, 0);
            grad.addColorStop(0.0, 'rgb(55, 125, 245)');
            grad.addColorStop(0.5, 'rgb(255, 255, 255)');
            grad.addColorStop(1.0, 'rgb(235, 60, 60)');
            legCtx.fillStyle = grad;
            legCtx.fillRect(0, 0, 240, 10);
            legCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            legCtx.strokeRect(0, 0, 240, 10);
            legCtx.restore();
        }
    }

    if (densityMode === '3d') {
        update3DScenes(amplitudes, N);
        render3DScenes();
        return;
    }

    if (!realCanvas2D || !imagCanvas2D) return;
    const panelWidth = getAvailablePanelWidth();
    const layout = computeHeatmapLayout(numStates, panelWidth);
    const dpr = window.devicePixelRatio || 1;
    realCanvas2D.width = layout.totalWidth * dpr;
    realCanvas2D.height = layout.totalHeight * dpr;
    realCanvas2D.style.width = `${layout.totalWidth}px`;
    realCanvas2D.style.height = `${layout.totalHeight}px`;
    drawHeatmapToContext(realCanvas2D.getContext('2d'), { matrix, numStates, N, isReal: true, title: 'Real Part (Re[ρ])', layout, dpr });
    imagCanvas2D.width = layout.totalWidth * dpr;
    imagCanvas2D.height = layout.totalHeight * dpr;
    imagCanvas2D.style.width = `${layout.totalWidth}px`;
    imagCanvas2D.style.height = `${layout.totalHeight}px`;
    drawHeatmapToContext(imagCanvas2D.getContext('2d'), { matrix, numStates, N, isReal: false, title: 'Imaginary Part (Im[ρ])', layout, dpr });
}

function generateDensityMatrixPng() {
    if (typeof document === 'undefined') return '';
    const N = currentQubits || (lastResult ? getQsphereState(lastResult).N : 0);
    const amplitudes = currentAmplitudes.length > 0 ? currentAmplitudes : (lastResult ? getQsphereState(lastResult).state : []);
    const numStates = 2 ** N;
    const matrix = computeDensityMatrix(amplitudes, N);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    if (densityMode === '3d' && threeReal && threeImag) {
        threeReal.renderer.render(threeReal.scene, threeReal.camera);
        threeImag.renderer.render(threeImag.scene, threeImag.camera);
        const stageW = threeReal.canvas.width;
        const stageH = threeReal.canvas.height;
        const padding = 20 * dpr;
        const gap = 24 * dpr;
        const legendH = 50 * dpr;
        const totalW = stageW * 2 + gap + padding * 2;
        const totalH = stageH + legendH + padding * 2;
        const offscreen = document.createElement('canvas');
        offscreen.width = totalW;
        offscreen.height = totalH;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return threeReal.canvas.toDataURL('image/png');
        ctx.drawImage(threeReal.canvas, padding, padding);
        ctx.drawImage(threeImag.canvas, padding + stageW + gap, padding);
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#e6e6ee';
        ctx.textAlign = 'center';
        ctx.fillText('Real Part (Re[ρ])', (padding + stageW / 2) / dpr, (padding - 6) / dpr);
        ctx.fillText('Imaginary Part (Im[ρ])', (padding + stageW + gap + stageW / 2) / dpr, (padding - 6) / dpr);
        drawBwrLegendToCanvas(ctx, { x: (totalW / dpr - 240) / 2, y: (padding + stageH + 16 * dpr) / dpr, width: 240, height: 10, title: 'Matrix Element Value', textColor: '#e6e6ee', showTitle: true, showTicks: true });
        ctx.restore();
        return offscreen.toDataURL('image/png');
    }

    const layout = computeHeatmapLayout(numStates, 360);
    const padding = 20;
    const gap = 24;
    const cssTotalW = layout.totalWidth * 2 + gap + padding * 2;
    const cssTotalH = layout.totalHeight + 55 + padding * 2;
    const totalW = cssTotalW * dpr;
    const totalH = cssTotalH * dpr;
    const offscreen = document.createElement('canvas');
    offscreen.width = totalW;
    offscreen.height = totalH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return '';
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.save();
    ctx.translate(padding, padding);
    drawHeatmapToContext(ctx, { matrix, numStates, N, isReal: true, title: 'Real Part (Re[ρ])', layout, dpr: 1 });
    ctx.restore();

    ctx.save();
    ctx.translate(padding + layout.totalWidth + gap, padding);
    drawHeatmapToContext(ctx, { matrix, numStates, N, isReal: false, title: 'Imaginary Part (Im[ρ])', layout, dpr: 1 });
    ctx.restore();

    drawBwrLegendToCanvas(ctx, {
        x: (cssTotalW - 240) / 2,
        y: padding + layout.totalHeight + 18,
        width: 240,
        height: 10,
        title: 'Matrix Element Value',
        textColor: '#e6e6ee',
        showTitle: true,
        showTicks: true
    });
    ctx.restore();
    return offscreen.toDataURL('image/png');
}

const densityMatrixVisualization = {
    id: 'densitymatrix',
    label: 'Density Matrix',
    mount(container) {
        initDensityElements();
        const densityContainerEl = document.getElementById('densitymatrix-container');
        if (densityContainerEl) {
            densityContainerEl.hidden = false;
            densityContainerEl.style.display = 'flex';
        }
        if (densityMode === '3d') resize3DRenderers();
        if (currentAmplitudes.length > 0) {
            drawDensityMatrixWithAmplitudes(currentAmplitudes, currentQubits);
        } else if (lastResult) {
            const { state, N } = getQsphereState(lastResult);
            drawDensityMatrixWithAmplitudes(state, N);
        }
    },
    unmount() {
        const densityContainerEl = document.getElementById('densitymatrix-container');
        if (densityContainerEl) {
            densityContainerEl.hidden = true;
            densityContainerEl.style.display = 'none';
        }
        const hoverInfo = getDensityHoverInfo();
        if (hoverInfo) hoverInfo.hidden = true;
    },
    update(result) {
        if (!result) return;
        lastResult = result;
        initDensityElements();
        const { state, N } = getQsphereState(result);
        targetAmplitudes = state;
        targetQubits = N;
        if (currentQubits !== N || currentAmplitudes.length !== state.length) {
            currentQubits = N;
            currentAmplitudes = Array.from({ length: state.length }, () => ({ re: 0, im: 0 }));
        }
        isTransitioning = true;
    },
    animate(lerpFactor = 0.20) {
        if (isTransitioning) {
            const transition = stepStatevectorTransition(currentAmplitudes, targetAmplitudes, lerpFactor, 1e-4);
            isTransitioning = transition.isTransitioning;
            currentAmplitudes = transition.currentAmplitudes;
            drawDensityMatrixWithAmplitudes(currentAmplitudes, currentQubits);
        }
        if (densityMode === '3d') render3DScenes();
    },
    resize() {
        if (densityMode === '3d') resize3DRenderers();
        if (currentAmplitudes.length > 0) {
            drawDensityMatrixWithAmplitudes(currentAmplitudes, currentQubits);
        } else if (lastResult) {
            const { state, N } = getQsphereState(lastResult);
            drawDensityMatrixWithAmplitudes(state, N);
        }
    },
    async export() {
        return { filenamePrefix: 'densitymatrix', pngDataUrl: generateDensityMatrixPng() };
    }
};

export default densityMatrixVisualization;

export {
    densityMatrixVisualization,
    initDensityElements,
    drawDensityMatrixWithAmplitudes,
    generateDensityMatrixPng,
    setDensityMode,
    getDensityMode,
    compute3DLabelPositions,
    createLabelSprite
};

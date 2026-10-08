import * as THREE from 'three';
import {
    projectPoint,
    rotateMatrix,
    getPhaseToRgb,
    formatBasisState,
    formatPhasePi,
    getQsphereState,
    hammingWeight,
    computeQspherePoints,
    stepStatevectorTransition
} from '../math/index.js';
import {
    drawPhaseLegendToCanvas
    // generatePhaseGradientSvgDef,
    // generatePhaseLegendSvg
} from '../render/phaseLegend.js';
import { getOrCreateHoverTooltip } from '../render/hoverTooltip.js';

let qsphereHoverInfo = null;
let currentAmplitudes = [];
let targetAmplitudes = [];
let currentQubits = 0;
let targetQubits = 0;
let isTransitioning = false;

function computeQsphereWithState(state, N) {
    const points = computeQspherePoints(N);
    return {
        points,
        hoverTargets: buildQSphereHoverTargets(state, N, points),
        state,
        N
    };
}

function buildQSphereHoverTargets(state, N, points = null) {
    const pts = points || computeQspherePoints(N);
    const targets = [];
    for (const point of pts) {
        const amp = state[point.index] || { re: 0, im: 0 };
        const probability = amp.re * amp.re + amp.im * amp.im;
        const phase = Math.atan2(amp.im, amp.re);
        targets.push({
            index: point.index,
            point: [point.x, point.y, point.z],
            probability,
            phase,
            radius: Math.max(0.08, 0.12 * Math.sqrt(probability))
        });
    }
    return targets;
}

function createQnodeMesh(cx, cy, cz, radius, r, g, b, a) {
    const geo = new THREE.SphereGeometry(radius, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r, g, b),
        transparent: a < 1.0,
        opacity: a
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, cz);
    return mesh;
}

function createSpokeMesh(end, radius, r, g, b, a) {
    const [ex, ey, ez] = end;
    const length = Math.hypot(ex, ey, ez);
    if (length < 1e-6) return null;

    const geo = new THREE.CylinderGeometry(radius, radius, length, 6);
    geo.translate(0, length / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r, g, b),
        transparent: a < 1.0,
        opacity: a
    });
    const mesh = new THREE.Mesh(geo, mat);

    const dir = new THREE.Vector3(ex, ey, ez).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.dot(up)) > 0.9999) {
        if (dir.y < 0) mesh.rotation.z = Math.PI;
    } else {
        mesh.quaternion.setFromUnitVectors(up, dir);
    }

    return mesh;
}

function createHammingRings(N, lineMat) {
    const group = new THREE.Group();
    const segments = 64;
    const mat = lineMat || new THREE.LineBasicMaterial({ color: 0x5a6578, transparent: true, opacity: 0.35 });
    for (let w = 1; w < N; w++) {
        const theta = (Math.PI * w) / N;
        const ringY = Math.cos(theta);
        const ringR = Math.sin(theta);
        const verts = [];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * 2 * Math.PI;
            verts.push(ringR * Math.cos(a), ringY, ringR * Math.sin(a));
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        group.add(new THREE.Line(geo, mat));
    }
    group.scale.set(1.025, 1.025, 1.025);
    return group;
}

let threeState = null;
let lastResult = null;
let _qsLabelData = [];
let _qsLastLabelKey = null;

function getQsphereHoverInfo() {
    const container = document.getElementById('container');
    if (!container) return null;
    qsphereHoverInfo = getOrCreateHoverTooltip(container, 'qsphere-hover-info', qsphereHoverInfo);
    return qsphereHoverInfo;
}

function rebuildQsphereLabels(points, N, state) {
    const qsLabelsDiv = document.getElementById('qs-labels');
    if (!qsLabelsDiv) return;
    if (!points || !N) {
        qsLabelsDiv.innerHTML = '';
        _qsLabelData = [];
        _qsLastLabelKey = null;
        return;
    }

    const visiblePoints = [];
    for (const pt of points) {
        if (state) {
            const amp = state[pt.index] || { re: 0, im: 0 };
            const probability = amp.re * amp.re + amp.im * amp.im;
            if (probability < 1e-5) continue;
        }
        visiblePoints.push(pt);
    }

    const visibleKey = `${N}:${visiblePoints.map(p => p.index).join(',')}`;
    if (visibleKey === _qsLastLabelKey) {
        return;
    }
    _qsLastLabelKey = visibleKey;

    qsLabelsDiv.innerHTML = '';
    _qsLabelData = [];

    for (const pt of visiblePoints) {
        const binaryStr = pt.index.toString(2).padStart(N, '0');
        const el = document.createElement('div');
        el.className = 'label qs-label';
        el.textContent = '|' + binaryStr + '⟩';
        el.dataset.ptIndex = String(pt.index);
        qsLabelsDiv.appendChild(el);
        _qsLabelData.push({ el, pos: [pt.x * 1.18, pt.y * 1.18, pt.z * 1.18] });
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

function updateQsphereSceneWithAmplitudes(state, N, options = {}) {
    if (!threeState) return;

    const qs = computeQsphereWithState(state, N);
    const points = qs.points;
    const group = threeState.qsphereGroup;

    if (threeState._qsphereGroupN !== N || !threeState._qsphereNodes || threeState._qsphereNodes.length !== points.length) {
        while (group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        }

        const rings = createHammingRings(N, threeState.lineMaterial);
        group.add(rings);

        const nodes = [];
        const spokes = [];

        for (const point of points) {
            const node = createQnodeMesh(point.x, point.y, point.z, 1, 1, 1, 1, 1.0);
            node.visible = false;
            group.add(node);
            nodes.push(node);

            const spoke = createSpokeMesh([point.x, point.y, point.z], 0.015, 1, 1, 1, 1.0);
            if (spoke) {
                spoke.visible = false;
                group.add(spoke);
                spokes.push(spoke);
            } else {
                spokes.push(null);
            }
        }

        threeState._qsphereGroupN = N;
        threeState._qsphereNodes = nodes;
        threeState._qsphereSpokes = spokes;
    }

    const nodes = threeState._qsphereNodes;
    const spokes = threeState._qsphereSpokes;
    const focusedIndex = threeState._qsphereHoveredIndex;

    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const node = nodes[i];
        const spoke = spokes[i];
        const amp = state[point.index] || { re: 0, im: 0 };
        const probability = amp.re * amp.re + amp.im * amp.im;

        if (probability < 1e-5) {
            if (node) node.visible = false;
            if (spoke) spoke.visible = false;
            continue;
        }

        const radius = 0.12 * Math.sqrt(probability);
        const phase = Math.atan2(amp.im, amp.re);
        const [r, g, b] = getPhaseToRgb(phase);
        const alpha = (focusedIndex === null || focusedIndex === undefined || point.index === focusedIndex) ? 1.0 : 0.24;

        if (node) {
            node.visible = true;
            node.scale.set(radius, radius, radius);
            node.material.color.setRGB(r, g, b);
            node.material.opacity = alpha;
            node.material.transparent = alpha < 1.0;
        }

        if (spoke) {
            spoke.visible = true;
            spoke.material.color.setRGB(r, g, b);
            spoke.material.opacity = alpha;
            spoke.material.transparent = alpha < 1.0;
        }
    }

    threeState._qsphereData = qs;
    if (options.rebuildLabels !== false) rebuildQsphereLabels(qs.points, qs.N, qs.state);
}

function setQsphereHoveredIndex(index) {
    if (!threeState || threeState._qsphereHoveredIndex === index) return;
    threeState._qsphereHoveredIndex = index;
    if (currentAmplitudes && currentAmplitudes.length > 0) {
        updateQsphereSceneWithAmplitudes(currentAmplitudes, currentQubits, { rebuildLabels: false });
    } else if (lastResult) {
        const { state, N } = getQsphereState(lastResult);
        updateQsphereSceneWithAmplitudes(state, N, { rebuildLabels: false });
    }
}

function clearQsphereHover() {
    setQsphereHoveredIndex(null);
    const hoverInfo = getQsphereHoverInfo();
    if (hoverInfo) hoverInfo.hidden = true;
}

function updateQsphereHover(event, canvas, rotationAngles) {
    const hoverInfo = getQsphereHoverInfo();
    if (!hoverInfo || !threeState?._qsphereData || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const point = [mouseX, mouseY];
    const modelMatrix = rotateMatrix(...rotationAngles, threeState._projMatrix);

    const qsphereData = threeState._qsphereData;
    const targets = qsphereData.hoverTargets || [];
    let best = null;

    for (const target of targets) {
        if (target.probability < 1e-4) continue;
        const screenPoint = projectPoint(target.point, modelMatrix, width, height);
        if (!screenPoint) continue;
        const distance = Math.hypot(point[0] - screenPoint[0], point[1] - screenPoint[1]);
        if (distance <= Math.max(16, target.radius * width * 0.45)) {
            if (!best || distance < best.distance) {
                best = { target, distance, screenPoint };
            }
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

/*
function generateQsphereSvg() {
    const qsphereData = threeState?._qsphereData;
    const N = qsphereData?.N || (lastResult ? getQsphereState(lastResult).N : 0);
    const state = qsphereData?.state || (lastResult ? getQsphereState(lastResult).state : []);
    const points = qsphereData?.points || computeQspherePoints(N);

    const totalW = 420;
    const totalH = 340;
    const sphereBoxSize = 300;
    const sphereOffsetX = 10;
    const sphereOffsetY = 20;

    const rotation = (typeof window !== 'undefined' && window.rotationAngles) ? window.rotationAngles : [0.3, 0.0, 0.0];
    const modelMatrix = threeState?._projMatrix
        ? rotateMatrix(...rotation, threeState._projMatrix)
        : rotateMatrix(0.3, 0.0, 0.0, threeState?._buildProjMatrix ? threeState._buildProjMatrix() : new Float32Array(16));

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">\n` +
        `  <defs>\n` +
        generatePhaseGradientSvgDef('qspherePhaseGrad', 'vertical') +
        `    <style>\n` +
        `      text { font-family: system-ui, -apple-system, sans-serif; }\n` +
        `    </style>\n` +
        `  </defs>\n`;

    // Hamming Rings
    const segments = 32;
    for (let w = 1; w < N; w++) {
        const theta = (Math.PI * w) / N;
        const ringY = Math.cos(theta);
        const ringR = Math.sin(theta);
        const ringPoints = [];
        for (let s = 0; s <= segments; s++) {
            const a = (s / segments) * 2 * Math.PI;
            const pt = projectPoint([ringR * Math.cos(a), ringY, ringR * Math.sin(a)], modelMatrix, sphereBoxSize, sphereBoxSize);
            if (pt) ringPoints.push(`${(pt[0] + sphereOffsetX).toFixed(1)},${(pt[1] + sphereOffsetY).toFixed(1)}`);
        }
        if (ringPoints.length > 1) {
            svg += `  <polyline points="${ringPoints.join(' ')}" fill="none" stroke="#5a6578" stroke-width="1" stroke-opacity="0.4"/>\n`;
        }
    }

    // Outer sphere boundary
    const sphereCenter = projectPoint([0, 0, 0], modelMatrix, sphereBoxSize, sphereBoxSize) || [sphereBoxSize / 2, sphereBoxSize / 2];
    svg += `  <circle cx="${(sphereCenter[0] + sphereOffsetX).toFixed(1)}" cy="${(sphereCenter[1] + sphereOffsetY).toFixed(1)}" r="92" fill="none" stroke="#5a6578" stroke-width="1.2" stroke-opacity="0.35"/>\n`;

    // Spokes and Nodes
    const originPt = projectPoint([0, 0, 0], modelMatrix, sphereBoxSize, sphereBoxSize);

    for (const point of points) {
        const amp = state[point.index] || { re: 0, im: 0 };
        const probability = amp.re * amp.re + amp.im * amp.im;
        if (probability < 1e-5) continue;

        const phase = Math.atan2(amp.im, amp.re);
        const [r, g, b] = getPhaseToRgb(phase);
        const color = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        const nodeRadius = Math.max(3, 14 * Math.sqrt(probability));

        const targetPt = projectPoint([point.x, point.y, point.z], modelMatrix, sphereBoxSize, sphereBoxSize);
        if (targetPt && originPt) {
            const tx = targetPt[0] + sphereOffsetX;
            const ty = targetPt[1] + sphereOffsetY;
            const ox = originPt[0] + sphereOffsetX;
            const oy = originPt[1] + sphereOffsetY;

            // Spoke
            svg += `  <line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-opacity="0.85"/>\n`;

            // Node sphere circle
            svg += `  <circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${nodeRadius.toFixed(1)}" fill="${color}" stroke="#ffffff" stroke-width="0.8"/>\n`;

            // Label
            const binStr = point.index.toString(2).padStart(N, '0');
            svg += `  <text x="${tx.toFixed(1)}" y="${(ty - nodeRadius - 4).toFixed(1)}" fill="#e0e0e0" font-size="11" font-weight="bold" text-anchor="middle">|${binStr}⟩</text>\n`;
        }
    }

    // Vertical Phase Legend on the right
    const legendX = 345;
    const legendY = 60;
    const legendW = 10;
    const legendH = 180;

    svg += generatePhaseLegendSvg({
        x: legendX,
        y: legendY,
        width: legendW,
        height: legendH,
        orientation: 'vertical',
        gradientId: 'qspherePhaseGrad',
        titleX: legendX + 16,
        titleY: legendY - 14
    });

    svg += `</svg>`;
    return svg;
}
*/

function generateQspherePng() {
    if (typeof document === 'undefined') return '';
    const canvas = document.querySelector('#canvas');
    if (!canvas || !threeState) return '';

    // Render current Three.js scene
    threeState.renderer.render(threeState.scene, threeState.camera);

    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const sphereW = canvas.width;
    const sphereH = canvas.height;
    const legendExtraW = Math.floor(75 * dpr);
    const totalW = sphereW + legendExtraW;
    const totalH = sphereH;

    const offscreen = document.createElement('canvas');
    offscreen.width = totalW;
    offscreen.height = totalH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');

    // Draw WebGL canvas
    ctx.drawImage(canvas, 0, 0);

    // Draw 3D projected HTML labels using live rotation
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#e0e0e0';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cssSphereW = sphereW / dpr;
    const cssSphereH = sphereH / dpr;
    const rotation = (typeof window !== 'undefined' && window.rotationAngles) ? window.rotationAngles : [0.3, 0.0, 0.0];
    const modelMatrix = rotateMatrix(...rotation, threeState._projMatrix);

    for (const item of _qsLabelData) {
        const pt = projectPoint(item.pos, modelMatrix, cssSphereW, cssSphereH);
        if (pt) {
            ctx.fillText(item.el.textContent, pt[0], pt[1]);
        }
    }
    ctx.shadowBlur = 0;

    // Draw vertical phase legend
    const legendX = cssSphereW + 15;
    const legendY = (cssSphereH - 180) / 2;
    const legendW = 10;
    const legendH = 180;

    drawPhaseLegendToCanvas(ctx, {
        x: legendX,
        y: legendY,
        width: legendW,
        height: legendH,
        orientation: 'vertical',
        showTitle: true,
        showTicks: true,
        titleX: legendX + 16,
        titleY: legendY - 12
    });

    ctx.restore();
    return offscreen.toDataURL('image/png');
}

const qsphereVisualization = {
    id: 'qsphere',
    label: 'Q-sphere',

    mount(container, sharedContext) {
        if (sharedContext?.threeState) {
            threeState = sharedContext.threeState;
        }
        const qsphereWrapper = document.getElementById('qsphere-view-wrapper');
        if (qsphereWrapper) {
            qsphereWrapper.hidden = false;
            qsphereWrapper.style.display = 'flex';
        }
        const canvas = document.querySelector('#canvas');
        if (canvas) {
            canvas.style.visibility = 'visible';
            canvas.style.display = 'block';
        }
        const qsLabels = document.getElementById('qs-labels');
        if (qsLabels) qsLabels.style.display = 'block';

        if (threeState) {
            threeState.qsphereGroup.visible = true;
            threeState.sphereMesh.visible = true;
            threeState.wireframe.visible = true;
            threeState.arrowGroup.visible = false;
        }

        if (lastResult) {
            const { state, N } = getQsphereState(lastResult);
            currentAmplitudes = state.map(a => ({ ...a }));
            currentQubits = N;
            targetAmplitudes = state;
            targetQubits = N;
            isTransitioning = false;
            updateQsphereSceneWithAmplitudes(state, N, { rebuildLabels: true });
        }
    },

    unmount() {
        const qsphereWrapper = document.getElementById('qsphere-view-wrapper');
        if (qsphereWrapper) {
            qsphereWrapper.hidden = true;
            qsphereWrapper.style.display = 'none';
        }
        const canvas = document.querySelector('#canvas');
        if (canvas) {
            canvas.style.visibility = 'hidden';
            canvas.style.display = 'none';
        }
        const qsLabels = document.getElementById('qs-labels');
        if (qsLabels) qsLabels.style.display = 'none';

        if (threeState) {
            threeState.qsphereGroup.visible = false;
        }
        clearQsphereHover();
    },

    update(result, options = {}) {
        if (!result) return;
        lastResult = result;
        const { state, N } = getQsphereState(result);
        targetAmplitudes = state;
        targetQubits = N;

        if (options.immediate || currentQubits !== N || currentAmplitudes.length !== state.length) {
            currentQubits = N;
            currentAmplitudes = state.map(a => ({ ...a }));
            isTransitioning = false;
            updateQsphereSceneWithAmplitudes(currentAmplitudes, currentQubits, options);
        } else {
            isTransitioning = true;
        }
    },

    animate(lerpFactor = 0.20) {
        if (isTransitioning) {
            const transition = stepStatevectorTransition(currentAmplitudes, targetAmplitudes, lerpFactor, 1e-4);
            currentAmplitudes = transition.currentAmplitudes;
            isTransitioning = transition.isTransitioning;
            updateQsphereSceneWithAmplitudes(currentAmplitudes, currentQubits, { rebuildLabels: false });
            if (!isTransitioning) {
                rebuildQsphereLabels(threeState?._qsphereData?.points, currentQubits, currentAmplitudes);
            }
        }
    },

    updateScene(sharedState) {
        if (sharedState) threeState = sharedState;
    },

    updateLabels(modelMatrix, w, h) {
        updateQsphereLabels(modelMatrix, w, h);
    },

    updateHover(event, canvas, rotationAngles) {
        updateQsphereHover(event, canvas, rotationAngles);
    },

    clearHover() {
        clearQsphereHover();
    },

    async export() {
        // const svgContent = generateQsphereSvg();
        const pngDataUrl = generateQspherePng();
        return {
            filenamePrefix: 'qsphere',
            pngDataUrl
            // svgContent
        };
    }
};

export default qsphereVisualization;

export {
    qsphereVisualization,
    hammingWeight,
    computeQspherePoints,
    computeQsphereWithState,
    buildQSphereHoverTargets,
    createQnodeMesh,
    createSpokeMesh,
    createHammingRings,
    updateQsphereSceneWithAmplitudes,
    rebuildQsphereLabels,
    updateQsphereLabels,
    updateQsphereHover,
    clearQsphereHover,
    setQsphereHoveredIndex,
    // generateQsphereSvg,
    generateQspherePng
};

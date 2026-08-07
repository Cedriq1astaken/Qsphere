// Q-sphere geometry and phase-color mapping.
// A Q-sphere places each computational basis state on a latitude determined by
// Hamming weight; amplitude magnitude controls node size and phase controls color.

// Count the number of one bits in a computational-basis index.
function hammingWeight(n) {
    let count = 0;
    while (n > 0) {
        count += n & 1;
        n >>>= 1;
    }
    return count;
}

// Convert an HSL color into normalized RGB components for WebGPU and Canvas 2D.
function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
}

// The phase mapping is shared by Q-sphere nodes, spokes, and the legend so the
// same phase always appears with the same pastel color.
function phaseToRgb(phase) {
    const deg = ((phase / (2 * Math.PI)) * 360 + 360) % 360;
    return hslToRgb(deg, 68, 68);
}

// Select the latest full-system snapshot and provide a zero-filled fallback when
// the parser has not produced a state yet.
function computeQsphereState(result) {
    const states = result?.states || [];
    const latest = states.length > 0 ? states[states.length - 1] : null;
    const N = latest?.qubits || result?.qubitsDeclared || 0;
    const state = latest?.amplitudes || Array.from(
        { length: 2 ** N },
        () => ({ re: 0, im: 0 })
    );
    return { state, N };
}

// Arrange basis states by Hamming weight. States with the same weight share a
// latitude and are evenly distributed around that latitude.
function computeQspherePoints(N) {
    const size = 2 ** N;
    const byWeight = Array.from({ length: N + 1 }, () => []);
    for (let k = 0; k < size; k++) byWeight[hammingWeight(k)].push(k);

    return Array.from({ length: size }, (_, k) => {
        const w = hammingWeight(k);
        const group = byWeight[w];
        const M = group.length;
        const j = group.indexOf(k);
        const theta = N === 0 ? 0 : (Math.PI * w) / N;
        const phi = M === 1 ? 0 : (2 * Math.PI * j) / M;
        return {
            index: k,
            x: Math.sin(theta) * Math.cos(phi),
            y: Math.cos(theta),
            z: Math.sin(theta) * Math.sin(phi),
            w
        };
    });
}

// Generate a small UV sphere centered at (cx, cy, cz). Each vertex stores position
// followed by a flat RGBA color; Q-sphere nodes use an unlit color shader.
function buildNodeSphere(cx, cy, cz, radius, r, g, b, a, segments) {
    const verts = [];
    for (let ri = 0; ri < segments; ri++) {
        const t0 = (ri / segments) * Math.PI;
        const t1 = ((ri + 1) / segments) * Math.PI;
        for (let si = 0; si < segments; si++) {
            const p0 = (si / segments) * 2 * Math.PI;
            const p1 = ((si + 1) / segments) * 2 * Math.PI;
            const v = [
                [Math.sin(t0) * Math.cos(p0), Math.cos(t0), Math.sin(t0) * Math.sin(p0)],
                [Math.sin(t0) * Math.cos(p1), Math.cos(t0), Math.sin(t0) * Math.sin(p1)],
                [Math.sin(t1) * Math.cos(p0), Math.cos(t1), Math.sin(t1) * Math.sin(p0)],
                [Math.sin(t1) * Math.cos(p1), Math.cos(t1), Math.sin(t1) * Math.sin(p1)]
            ];
            for (const tri of [[0, 1, 2], [1, 3, 2]]) {
                for (const vi of tri) {
                    const [nx, ny, nz] = v[vi];
                    verts.push(cx + radius * nx, cy + radius * ny, cz + radius * nz, r, g, b, a);
                }
            }
        }
    }
    return verts;
}

function getFocusedAlpha(pointIndex, focusedIndex) {
    if (focusedIndex === null || focusedIndex === undefined || pointIndex === focusedIndex) {
        return 1.0;
    }
    return 0.24;
}

// Build one colored node for every basis state whose probability is non-negligible.
// The square-root probability radius keeps visual area roughly proportional to
// amplitude magnitude while avoiding enormous nodes for high probabilities.
function buildQNodes(state, N, focusedIndex) {
    const verts = [];
    const points = computeQspherePoints(N);
    for (const point of points) {
        const amp = state[point.index] || { re: 0, im: 0 };
        const probability = amp.re * amp.re + amp.im * amp.im;
        if (probability < 1e-5) continue;
        const radius = 0.12 * Math.sqrt(probability);
        const phase = Math.atan2(amp.im, amp.re);
        const [r, g, b] = phaseToRgb(phase);
        const alpha = getFocusedAlpha(point.index, focusedIndex);
        verts.push(...buildNodeSphere(point.x, point.y, point.z, radius, r, g, b, alpha, 8));
    }
    return new Float32Array(verts);
}

// Draw the latitude rings associated with intermediate Hamming weights. The poles
// are represented by the |0...0> and |1...1> nodes, so they need no rings.
function buildHammingRings(N) {
    const verts = [];
    const segments = 64;
    for (let w = 1; w < N; w++) {
        const theta = (Math.PI * w) / N;
        const ringY = Math.cos(theta);
        const ringR = Math.sin(theta);
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * 2 * Math.PI;
            const a1 = ((i + 1) / segments) * 2 * Math.PI;
            verts.push(
                ringR * Math.cos(a0), ringY, ringR * Math.sin(a0), 0, 1, 0,
                ringR * Math.cos(a1), ringY, ringR * Math.sin(a1), 0, 1, 0
            );
        }
    }
    return new Float32Array(verts);
}

// Build a slim triangular tube from the Q-sphere center to a node. WebGPU line
// primitives have implementation-defined width, so real geometry gives the spokes
// a reliable visible thickness.
function buildSpokeTube(end, radius, r, g, b, a, segments) {
    const [ex, ey, ez] = end;
    const length = Math.hypot(ex, ey, ez);
    if (length < 1e-6) return [];

    const dir = [ex / length, ey / length, ez / length];
    const reference = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let sideA = [
        dir[1] * reference[2] - dir[2] * reference[1],
        dir[2] * reference[0] - dir[0] * reference[2],
        dir[0] * reference[1] - dir[1] * reference[0]
    ];
    const sideALen = Math.hypot(sideA[0], sideA[1], sideA[2]);
    sideA = [sideA[0] / sideALen, sideA[1] / sideALen, sideA[2] / sideALen];

    const sideB = [
        dir[1] * sideA[2] - dir[2] * sideA[1],
        dir[2] * sideA[0] - dir[0] * sideA[2],
        dir[0] * sideA[1] - dir[1] * sideA[0]
    ];

    const verts = [];
    const ringPoint = (base, angle) => {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return [
            base[0] + radius * (sideA[0] * c + sideB[0] * s),
            base[1] + radius * (sideA[1] * c + sideB[1] * s),
            base[2] + radius * (sideA[2] * c + sideB[2] * s)
        ];
    };

    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * 2 * Math.PI;
        const a1 = ((i + 1) / segments) * 2 * Math.PI;
        const start0 = ringPoint([0, 0, 0], a0);
        const start1 = ringPoint([0, 0, 0], a1);
        const end0 = ringPoint(end, a0);
        const end1 = ringPoint(end, a1);

        verts.push(...start0, r, g, b, a, ...end0, r, g, b, a, ...start1, r, g, b, a);
        verts.push(...start1, r, g, b, a, ...end0, r, g, b, a, ...end1, r, g, b, a);
    }

    return verts;
}

// Connect the center of the sphere to every occupied basis-state node. Spoke color
// matches the destination dot so phase is readable even before noticing the dot.
function buildQSphereSpokes(state, N, focusedIndex) {
    const verts = [];
    const points = computeQspherePoints(N);
    for (const point of points) {
        const amp = state[point.index] || { re: 0, im: 0 };
        const probability = amp.re * amp.re + amp.im * amp.im;
        if (probability < 1e-5) continue;

        const phase = Math.atan2(amp.im, amp.re);
        const [r, g, b] = phaseToRgb(phase);
        const alpha = getFocusedAlpha(point.index, focusedIndex);
        verts.push(...buildSpokeTube([point.x, point.y, point.z], 0.015, r, g, b, alpha, 6));
    }
    return new Float32Array(verts);
}

function buildQSphereHoverTargets(state, N) {
    const points = computeQspherePoints(N);
    return points.map(point => {
        const amp = state[point.index] || { re: 0, im: 0 };
        const probability = amp.re * amp.re + amp.im * amp.im;
        return {
            index: point.index,
            pos: [point.x, point.y, point.z],
            probability,
            phase: Math.atan2(amp.im, amp.re),
            radius: 0.12 * Math.sqrt(probability)
        };
    }).filter(target => target.probability >= 1e-5);
}

// Assemble all GPU buffers and label data needed to render one Q-sphere snapshot.
// Ring and spoke buffers remain separate because Bloch mini-renderers use a
// different line buffer and should never receive Q-sphere ring geometry.
function computeQsphere(result, options) {
    const focusedIndex = options?.focusedIndex;
    const { state, N } = computeQsphereState(result);
    const ringVertices = buildHammingRings(N);
    const spokeVertices = buildQSphereSpokes(state, N, focusedIndex);
    return {
        nodeVertices: buildQNodes(state, N, focusedIndex),
        ringVertices,
        spokeVertices,
        lineVertices: ringVertices,
        points: computeQspherePoints(N),
        hoverTargets: buildQSphereHoverTargets(state, N),
        state,
        N
    };
}

// Support both browser globals and CommonJS unit tests.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        computeQsphere,
        buildHammingRings,
        buildQSphereSpokes,
        buildQSphereHoverTargets,
        buildQNodes,
        computeQspherePoints
    };
} else if (typeof window !== 'undefined') {
    window.computeQsphere = computeQsphere;
    window.buildHammingRings = buildHammingRings;
    window.buildQSphereSpokes = buildQSphereSpokes;
    window.buildQSphereHoverTargets = buildQSphereHoverTargets;
    window.buildQNodes = buildQNodes;
    window.computeQspherePoints = computeQspherePoints;
}

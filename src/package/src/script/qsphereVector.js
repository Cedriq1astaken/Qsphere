function hammingWeight(n) {
    let count = 0;
    while (n > 0) {
        count += n & 1;
        n >>>= 1;
    }
    return count;
}

function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
}

function phaseToRgb(phase) {
    const deg = ((phase / (2 * Math.PI)) * 360 + 360) % 360;
    return hslToRgb(deg, 100, 50);
}

function qsphereInitialState(N) {
    const size = 1 << N;
    const state = [];
    for (let i = 0; i < size; i++) {
        state.push(new Complex(i === 0 ? 1 : 0, 0));
    }
    return state;
}

function qsphereApplyGate(state, gate, targetQubit, N) {
    const size = 1 << N;
    const newState = state.slice();
    const bit = 1 << targetQubit;

    for (let i = 0; i < size; i++) {
        if (i & bit) continue;
        const j = i | bit;
        const a = state[i];
        const b = state[j];
        newState[i] = gate[0][0].mul(a).add(gate[0][1].mul(b));
        newState[j] = gate[1][0].mul(a).add(gate[1][1].mul(b));
    }

    return newState;
}

function computeQsphereState(parsedResult) {
    const N = parsedResult.qubitsDeclared || 1;
    let state = qsphereInitialState(N);
    const ops = parsedResult.operations || [];

    for (let i = 0; i < ops.length; i++) {
        const gate = getGateMatrix(ops[i].operation, ops[i].angle);
        state = qsphereApplyGate(state, gate, ops[i].target, N);
    }

    return { state, N };
}

function computeQspherePoints(N) {
    const size = 1 << N;
    const byWeight = [];
    for (let w = 0; w <= N; w++) byWeight.push([]);

    for (let k = 0; k < size; k++) {
        byWeight[hammingWeight(k)].push(k);
    }

    const points = [];
    for (let k = 0; k < size; k++) {
        const w = hammingWeight(k);
        const group = byWeight[w];
        const M = group.length;
        const j = group.indexOf(k);
        const theta = N === 0 ? 0 : (Math.PI * w) / N;
        const phi = M === 1 ? 0 : (2 * Math.PI * j) / M;
        const x = Math.sin(theta) * Math.cos(phi);
        const y = Math.cos(theta);
        const z = Math.sin(theta) * Math.sin(phi);
        points.push({ index: k, x, y, z, w });
    }

    return points;
}

function buildNodeSphere(cx, cy, cz, radius, r, g, b, segments) {
    const verts = [];
    const rings = segments;
    const slices = segments;

    for (let ri = 0; ri < rings; ri++) {
        const t0 = (ri / rings) * Math.PI;
        const t1 = ((ri + 1) / rings) * Math.PI;

        for (let si = 0; si < slices; si++) {
            const p0 = (si / slices) * 2 * Math.PI;
            const p1 = ((si + 1) / slices) * 2 * Math.PI;

            const v = [
                [Math.sin(t0) * Math.cos(p0), Math.cos(t0), Math.sin(t0) * Math.sin(p0)],
                [Math.sin(t0) * Math.cos(p1), Math.cos(t0), Math.sin(t0) * Math.sin(p1)],
                [Math.sin(t1) * Math.cos(p0), Math.cos(t1), Math.sin(t1) * Math.sin(p0)],
                [Math.sin(t1) * Math.cos(p1), Math.cos(t1), Math.sin(t1) * Math.sin(p1)]
            ];

            const tris = [[0, 1, 2], [1, 3, 2]];
            for (const tri of tris) {
                for (const vi of tri) {
                    const nx = v[vi][0], ny = v[vi][1], nz = v[vi][2];
                    verts.push(
                        cx + radius * nx,
                        cy + radius * ny,
                        cz + radius * nz,
                        r, g, b
                    );
                }
            }
        }
    }

    return verts;
}

function buildQNodes(state, N) {
    const points = computeQspherePoints(N);
    const verts = [];
    const minProb = 1e-5;
    const maxRadius = 0.12;
    const segments = 8;

    for (const pt of points) {
        const amp = state[pt.index];
        const prob = amp.abs2();
        if (prob < minProb) continue;

        const radius = maxRadius * Math.sqrt(prob);
        const phase = Math.atan2(amp.im, amp.re);
        const [r, g, b] = phaseToRgb(phase);

        const nodeVerts = buildNodeSphere(pt.x, pt.y, pt.z, radius, r, g, b, segments);
        for (const v of nodeVerts) verts.push(v);
    }

    return new Float32Array(verts);
}

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

function computeQsphere(parsedResult) {
    const { state, N } = computeQsphereState(parsedResult);
    const nodeVertices = buildQNodes(state, N);
    const ringVertices = buildHammingRings(N);
    const points = computeQspherePoints(N);

    return { nodeVertices, ringVertices, points, state, N };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        computeQsphere,
        buildHammingRings,
        buildQNodes,
        computeQspherePoints,
        qsphereInitialState,
        qsphereApplyGate
    };
} else if (typeof window !== 'undefined') {
    window.computeQsphere = computeQsphere;
    window.buildHammingRings = buildHammingRings;
    window.buildQNodes = buildQNodes;
    window.computeQspherePoints = computeQspherePoints;
}

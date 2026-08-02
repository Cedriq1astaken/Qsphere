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

function buildNodeSphere(cx, cy, cz, radius, r, g, b, segments) {
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
                    verts.push(cx + radius * nx, cy + radius * ny, cz + radius * nz, r, g, b);
                }
            }
        }
    }
    return verts;
}

function buildQNodes(state, N) {
    const verts = [];
    const points = computeQspherePoints(N);
    for (const point of points) {
        const amp = state[point.index] || { re: 0, im: 0 };
        const probability = amp.re * amp.re + amp.im * amp.im;
        if (probability < 1e-5) continue;
        const radius = 0.12 * Math.sqrt(probability);
        const phase = Math.atan2(amp.im, amp.re);
        const [r, g, b] = phaseToRgb(phase);
        verts.push(...buildNodeSphere(point.x, point.y, point.z, radius, r, g, b, 8));
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

function computeQsphere(result) {
    const { state, N } = computeQsphereState(result);
    return {
        nodeVertices: buildQNodes(state, N),
        ringVertices: buildHammingRings(N),
        points: computeQspherePoints(N),
        state,
        N
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { computeQsphere, buildHammingRings, buildQNodes, computeQspherePoints };
} else if (typeof window !== 'undefined') {
    window.computeQsphere = computeQsphere;
    window.buildHammingRings = buildHammingRings;
    window.buildQNodes = buildQNodes;
    window.computeQspherePoints = computeQspherePoints;
}

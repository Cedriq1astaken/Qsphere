function complexAbs2(value) {
    return value.re * value.re + value.im * value.im;
}

function extractQubitBloch(snapshot, targetQubit) {
    if (!snapshot || snapshot.qubits === 0 || targetQubit >= snapshot.qubits) return [0, 0, 1];
    const state = snapshot.amplitudes;
    const qubits = snapshot.qubits;
    const bit = 1 << (qubits - 1 - targetQubit);
    let rho00 = 0;
    let rho11 = 0;
    let rho10Re = 0;
    let rho10Im = 0;

    for (let i = 0; i < state.length; i++) {
        if (i & bit) continue;
        const j = i | bit;
        const ci = state[i] || { re: 0, im: 0 };
        const cj = state[j] || { re: 0, im: 0 };
        rho00 += complexAbs2(ci);
        rho11 += complexAbs2(cj);
        rho10Re += ci.re * cj.re + ci.im * cj.im;
        rho10Im += ci.re * cj.im - ci.im * cj.re;
    }
    return [2 * rho10Re, 2 * rho10Im, rho00 - rho11];
}

function alignmentRotation(targetVec) {
    const from = [0, 0, 1];
    const to = vec3Normalize(targetVec);
    const dot = vec3Dot(from, to);
    if (dot > 0.99999) return { axis: [1, 0, 0], angle: 0 };
    if (dot < -0.99999) return { axis: [1, 0, 0], angle: Math.PI };
    return {
        axis: vec3Normalize(vec3Cross(from, to)),
        angle: Math.acos(Math.max(-1, Math.min(1, dot)))
    };
}

function buildArrowVertices(blochVec, options) {
    const r = Math.sqrt(blochVec[0] ** 2 + blochVec[1] ** 2 + blochVec[2] ** 2);
    if (r < 0.001) return new Float32Array(0);

    const opts = options || {};
    const baseShaftRadius = opts.shaftRadius ?? 0.02;
    const baseHeadRadius = opts.headRadius ?? 0.055;
    const segments = opts.segments ?? 12;
    const headLength = 0.14 * r;
    const shaftLength = 0.86 * r;
    const radiusScale = Math.max(0.3, Math.min(1.0, r));
    const shaftRadius = baseShaftRadius * radiusScale;
    const headRadius = baseHeadRadius * radiusScale;
    const verts = [];
    const { axis, angle } = alignmentRotation(blochVec);

    function pushVertex(pos, norm) {
        const rp = rodriguesRotate(pos, axis, angle);
        const rn = vec3Normalize(rodriguesRotate(norm, axis, angle));
        verts.push(rp[0], rp[1], rp[2], rn[0], rn[1], rn[2]);
    }

    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * 2 * Math.PI;
        const a1 = ((i + 1) / segments) * 2 * Math.PI;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const n0 = [c0, s0, 0], n1 = [c1, s1, 0];
        const bot0 = [shaftRadius * c0, shaftRadius * s0, 0];
        const top0 = [shaftRadius * c0, shaftRadius * s0, shaftLength];
        const bot1 = [shaftRadius * c1, shaftRadius * s1, 0];
        const top1 = [shaftRadius * c1, shaftRadius * s1, shaftLength];
        pushVertex(bot0, n0); pushVertex(bot1, n1); pushVertex(top0, n0);
        pushVertex(bot1, n1); pushVertex(top1, n1); pushVertex(top0, n0);
    }

    const tipZ = shaftLength + headLength;
    const coneSlope = headLength > 0 ? headRadius / headLength : 0;
    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * 2 * Math.PI;
        const a1 = ((i + 1) / segments) * 2 * Math.PI;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const base0 = [headRadius * c0, headRadius * s0, shaftLength];
        const base1 = [headRadius * c1, headRadius * s1, shaftLength];
        const tip = [0, 0, tipZ];
        const cn0 = vec3Normalize([c0, s0, coneSlope]);
        const cn1 = vec3Normalize([c1, s1, coneSlope]);
        const cnt = vec3Normalize([(c0 + c1) / 2, (s0 + s1) / 2, coneSlope]);
        pushVertex(base0, cn0); pushVertex(base1, cn1); pushVertex(tip, cnt);
    }

    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * 2 * Math.PI;
        const a1 = ((i + 1) / segments) * 2 * Math.PI;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const capNorm = [0, 0, -1];
        pushVertex([0, 0, shaftLength], capNorm);
        pushVertex([headRadius * c1, headRadius * s1, shaftLength], capNorm);
        pushVertex([headRadius * c0, headRadius * s0, shaftLength], capNorm);
    }
    return new Float32Array(verts);
}

function computeBlochArrow(result, targetQubit = 0) {
    const snapshots = result?.states || [];
    const stepVectors = snapshots.map(snapshot => {
        const bloch = extractQubitBloch(snapshot, targetQubit);
        return [bloch[0], bloch[2], bloch[1]];
    });
    const screenVector = stepVectors.length > 0 ? stepVectors[stepVectors.length - 1] : [0, 1, 0];
    return {
        vertices: buildArrowVertices(screenVector),
        blochVector: [screenVector[0], screenVector[2], screenVector[1]],
        screenVector,
        stepVectors
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractQubitBloch, buildArrowVertices, computeBlochArrow };
} else if (typeof window !== 'undefined') {
    window.computeBlochArrow = computeBlochArrow;
    window.extractQubitBloch = extractQubitBloch;
    window.buildArrowVertices = buildArrowVertices;
}

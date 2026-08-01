function initialState() {
    return [new Complex(1, 0), new Complex(0, 0)];
}

function applyGate(state, gate) {
    const newAlpha = gate[0][0].mul(state[0]).add(gate[0][1].mul(state[1]));
    const newBeta = gate[1][0].mul(state[0]).add(gate[1][1].mul(state[1]));
    return [newAlpha, newBeta];
}

function stateToBloch(state) {
    const alpha = state[0];
    const beta = state[1];
    const alphaConjBeta = alpha.conj().mul(beta);
    const x = 2 * alphaConjBeta.re;
    const y = 2 * alphaConjBeta.im;
    const z = alpha.abs2() - beta.abs2();
    return [x, y, z];
}

function alignmentRotation(targetVec) {
    const from = [0, 0, 1];
    const to = vec3Normalize(targetVec);
    const dot = vec3Dot(from, to);

    if (dot > 0.99999) return { axis: [1, 0, 0], angle: 0 };
    if (dot < -0.99999) return { axis: [1, 0, 0], angle: Math.PI };

    const axis = vec3Normalize(vec3Cross(from, to));
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    return { axis, angle };
}

function buildArrowVertices(blochVec, options) {
    const opts = options || {};
    const shaftRadius = opts.shaftRadius !== undefined ? opts.shaftRadius : 0.02;
    const headRadius = opts.headRadius !== undefined ? opts.headRadius : 0.055;
    const headLength = opts.headLength !== undefined ? opts.headLength : 0.14;
    const shaftLength = opts.shaftLength !== undefined ? opts.shaftLength : 0.86;
    const segments = opts.segments !== undefined ? opts.segments : 12;

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
        const n0 = [c0, s0, 0];
        const n1 = [c1, s1, 0];
        const bot0 = [shaftRadius * c0, shaftRadius * s0, 0];
        const top0 = [shaftRadius * c0, shaftRadius * s0, shaftLength];
        const bot1 = [shaftRadius * c1, shaftRadius * s1, 0];
        const top1 = [shaftRadius * c1, shaftRadius * s1, shaftLength];
        pushVertex(bot0, n0);
        pushVertex(bot1, n1);
        pushVertex(top0, n0);
        pushVertex(bot1, n1);
        pushVertex(top1, n1);
        pushVertex(top0, n0);
    }

    const tipZ = shaftLength + headLength;
    const coneSlope = headRadius / headLength;

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
        pushVertex(base0, cn0);
        pushVertex(base1, cn1);
        pushVertex(tip, cnt);
    }

    const capNorm = [0, 0, -1];
    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * 2 * Math.PI;
        const a1 = ((i + 1) / segments) * 2 * Math.PI;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        pushVertex([0, 0, shaftLength], capNorm);
        pushVertex([headRadius * c1, headRadius * s1, shaftLength], capNorm);
        pushVertex([headRadius * c0, headRadius * s0, shaftLength], capNorm);
    }

    return new Float32Array(verts);
}

let _storedParsedResult = null;

function storeParsedCopy(parsedResult) {
    _storedParsedResult = JSON.parse(JSON.stringify(parsedResult));
}

function getStoredCopy() {
    return _storedParsedResult;
}

function diffParsedResults(oldResult, newResult) {
    const diff = {
        qubitsDeclaredChanged: false,
        addedOps: [],
        removedOps: [],
        changedOps: []
    };

    if (!oldResult) {
        diff.qubitsDeclaredChanged = true;
        diff.addedOps = newResult.operations
            ? newResult.operations.map(function (op, i) { return { index: i, op: op }; })
            : [];
        return diff;
    }

    if (oldResult.qubitsDeclared !== newResult.qubitsDeclared) {
        diff.qubitsDeclaredChanged = true;
    }

    const oldOps = oldResult.operations || [];
    const newOps = newResult.operations || [];
    const maxLen = Math.max(oldOps.length, newOps.length);

    for (let i = 0; i < maxLen; i++) {
        const o = oldOps[i];
        const n = newOps[i];
        if (!o && n) {
            diff.addedOps.push({ index: i, op: n });
        } else if (o && !n) {
            diff.removedOps.push({ index: i, op: o });
        } else if (o && n && (o.operation !== n.operation || o.target !== n.target)) {
            diff.changedOps.push({ index: i, oldOp: o, newOp: n });
        }
    }

    return diff;
}

function computeBlochArrow(parsedResult, targetQubit) {
    if (targetQubit === undefined) targetQubit = 0;

    const oldCopy = getStoredCopy();
    const diff = diffParsedResults(oldCopy, parsedResult);
    storeParsedCopy(parsedResult);

    let state = initialState();
    const ops = parsedResult.operations || [];
    const stepVectors = [];

    const initBloch = stateToBloch(state);
    stepVectors.push([initBloch[0], initBloch[2], initBloch[1]]);

    for (let i = 0; i < ops.length; i++) {
        if (ops[i].target === targetQubit) {
            const gate = getGateMatrix(ops[i].operation, ops[i].angle);
            state = applyGate(state, gate);
            const stepBloch = stateToBloch(state);
            stepVectors.push([stepBloch[0], stepBloch[2], stepBloch[1]]);
        }
    }

    const blochVec = stateToBloch(state);
    const screenVec = [blochVec[0], blochVec[2], blochVec[1]];
    const vertices = buildArrowVertices(screenVec);

    return {
        vertices: vertices,
        blochVector: blochVec,
        screenVector: screenVec,
        stepVectors: stepVectors,
        diff: diff
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initialState,
        applyGate,
        stateToBloch,
        buildArrowVertices,
        diffParsedResults,
        computeBlochArrow
    };
} else if (typeof window !== 'undefined') {
    window.computeBlochArrow = computeBlochArrow;
    window.applyGate = applyGate;
    window.stateToBloch = stateToBloch;
    window.buildArrowVertices = buildArrowVertices;
    window.diffParsedResults = diffParsedResults;
}

/**
 * Qiskit Python Parser & Quantum State Simulator
 *
 * Pure JavaScript implementation that parses Python/Qiskit source code,
 * extracts quantum circuit definitions, simulates gate operations on
 * a state vector, and produces output in the same format as the Q# runtime.
 *
 * Output schema:
 *   { qubitsDeclared, qubitsList, states, steps, error? }
 *
 * where each state is { qubits, amplitudes: [{re, im}, ...] }
 */

import { parser } from '@lezer/python';
import { OpenQasmProgram } from '../qasm/ir.js';

// ---------------------------------------------------------------------------
// Complex number helpers (lightweight, self-contained)
// ---------------------------------------------------------------------------

function c(re, im) { return { re: re || 0, im: im || 0 }; }
function cAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function cSub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function cMul(a, b) {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function cScale(a, s) { return { re: a.re * s, im: a.im * s }; }
function cExp(theta) { return { re: Math.cos(theta), im: Math.sin(theta) }; }
function cAbs2(a) { return a.re * a.re + a.im * a.im; }

// ---------------------------------------------------------------------------
// 1. Import validation
// ---------------------------------------------------------------------------

const QISKIT_IMPORT_RE = /(?:^|\n)\s*(?:import\s+qiskit|from\s+qiskit(?:\.\w+)*\s+import\s+)/;

function hasQiskitImport(source) {
    return QISKIT_IMPORT_RE.test(source);
}

// ---------------------------------------------------------------------------
// 1b. AST line & argument helpers
// ---------------------------------------------------------------------------

function computeLineOffsets(source) {
    const offsets = [0];
    for (let i = 0; i < source.length; i++) {
        if (source[i] === '\n') {
            offsets.push(i + 1);
        }
    }
    return offsets;
}

function getLineFromOffset(offset, offsets) {
    let low = 0, high = offsets.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (offsets[mid] <= offset) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return high;
}

function parseArgs(argsStr) {
    const args = [];
    let depth = 0;
    let current = '';
    for (const ch of argsStr) {
        if (ch === '(' || ch === '[') { depth++; current += ch; }
        else if (ch === ')' || ch === ']') { depth--; current += ch; }
        else if (ch === ',' && depth === 0) { args.push(current.trim()); current = ''; }
        else { current += ch; }
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

function parseCallArguments(argListNode, source) {
    if (!argListNode) return [];
    const text = source.slice(argListNode.from, argListNode.to).trim();
    if (text.startsWith('(') && text.endsWith(')')) {
        return parseArgs(text.slice(1, -1));
    }
    return parseArgs(text);
}

// ---------------------------------------------------------------------------
// 2. Python expression evaluator (for angle parameters & variables)
// ---------------------------------------------------------------------------

const PY_MATH = {
    acos: Math.acos,
    arccos: Math.acos,
    asin: Math.asin,
    arcsin: Math.asin,
    atan: Math.atan,
    arctan: Math.atan,
    atan2: Math.atan2,
    arctan2: Math.atan2,
    cos: Math.cos,
    sin: Math.sin,
    tan: Math.tan,
    cosh: Math.cosh,
    sinh: Math.sinh,
    tanh: Math.tanh,
    sqrt: Math.sqrt,
    exp: Math.exp,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    abs: Math.abs,
    fabs: Math.abs,
    pow: Math.pow,
    pi: Math.PI,
    PI: Math.PI,
    e: Math.E,
    E: Math.E
};

const ALLOWED_MATH_IDENTS = new Set([
    'Math', 'math', 'np', 'numpy',
    'acos', 'arccos', 'asin', 'arcsin', 'atan', 'arctan', 'atan2', 'arctan2',
    'cos', 'sin', 'tan', 'cosh', 'sinh', 'tanh',
    'sqrt', 'exp', 'log', 'log2', 'log10', 'floor', 'ceil', 'round', 'abs', 'fabs', 'pow',
    'pi', 'PI', 'e', 'E'
]);

function evalPythonExpr(expr, scope = {}) {
    if (expr == null) return NaN;
    let s = String(expr).trim();
    if (!s) return NaN;

    // Handle len(x)
    s = s.replace(/\blen\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g, (_, name) => {
        if (scope && scope[name] !== undefined && (Array.isArray(scope[name]) || typeof scope[name].length === 'number')) {
            return String(scope[name].length);
        }
        return '0';
    });

    // Handle Python integer division // (replace a // b with Math.floor((a) / (b)))
    while (s.includes('//')) {
        const next = s.replace(/([0-9eE.\w()]+)\s*\/\/\s*([0-9eE.\w()]+)/, 'Math.floor(($1) / ($2))');
        if (next === s) break;
        s = next;
    }

    const scopeKeys = Object.keys(scope).filter(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
    const scopeVals = scopeKeys.map(k => scope[k]);

    // Validation: ensure expression only contains allowed math identifiers, scope variables, numbers, and operators
    const checkStr = s.replace(/[A-Za-z_][A-Za-z0-9_]*/g, match => {
        if (ALLOWED_MATH_IDENTS.has(match) || scopeKeys.includes(match)) return '';
        return match;
    });

    if (/[^0-9eE.\-+*/()% \t,\[\]]/.test(checkStr)) {
        return NaN;
    }

    try {
        const fn = new Function(
            'Math', 'math', 'np', 'numpy',
            'acos', 'arccos', 'asin', 'arcsin', 'atan', 'arctan', 'atan2', 'arctan2',
            'cos', 'sin', 'tan', 'cosh', 'sinh', 'tanh',
            'sqrt', 'exp', 'log', 'log2', 'log10', 'floor', 'ceil', 'round', 'abs', 'fabs', 'pow',
            'pi', 'e',
            ...scopeKeys,
            `"use strict"; return (${s});`
        );
        const result = fn(
            Math, PY_MATH, PY_MATH, PY_MATH,
            Math.acos, Math.acos, Math.asin, Math.asin, Math.atan, Math.atan, Math.atan2, Math.atan2,
            Math.cos, Math.sin, Math.tan, Math.cosh, Math.sinh, Math.tanh,
            Math.sqrt, Math.exp, Math.log, Math.log2, Math.log10, Math.floor, Math.ceil, Math.round, Math.abs, Math.abs, Math.pow,
            Math.PI, Math.E,
            ...scopeVals
        );
        return typeof result === 'number' ? result : NaN;
    } catch {
        return NaN;
    }
}

// ---------------------------------------------------------------------------
// 3. Circuit detection
// ---------------------------------------------------------------------------

function findCircuitInit(source) {
    if (!source) return null;

    const lineOffsets = computeLineOffsets(source);
    const rawLines = source.split('\n');

    // Detect aliased QuantumCircuit names (e.g. from qiskit.circuit import QuantumCircuit as QC)
    const aliasMatch = source.match(/from\s+qiskit(?:\.\w+)*\s+import\s+QuantumCircuit\s+as\s+(\w+)/);
    const validClassNames = new Set(['QuantumCircuit']);
    if (aliasMatch) validClassNames.add(aliasMatch[1]);

    try {
        const tree = parser.parse(source);
        const preScope = {};

        let child = tree.topNode.firstChild;
        while (child) {
            if (child.name === 'AssignStatement') {
                let sub = child.firstChild;
                let lhsNode = null, rhsNode = null;
                while (sub) {
                    if (sub.name !== 'AssignOp' && sub.name !== 'Comment') {
                        if (!lhsNode) lhsNode = sub;
                        else rhsNode = sub;
                    }
                    sub = sub.nextSibling;
                }

                if (lhsNode && rhsNode) {
                    const lhsText = source.slice(lhsNode.from, lhsNode.to).trim();
                    const rhsText = source.slice(rhsNode.from, rhsNode.to).trim();

                    let isCircuitCall = false;
                    let argListNode = null;

                    if (rhsNode.name === 'CallExpression') {
                        let cChild = rhsNode.firstChild;
                        if (cChild) {
                            let calleeName = source.slice(cChild.from, cChild.to).trim();
                            if (calleeName.includes('.')) {
                                calleeName = calleeName.split('.').pop();
                            }
                            if (validClassNames.has(calleeName)) {
                                isCircuitCall = true;
                                let next = cChild.nextSibling;
                                while (next) {
                                    if (next.name === 'ArgList') {
                                        argListNode = next;
                                        break;
                                    }
                                    next = next.nextSibling;
                                }
                            }
                        }
                    }

                    if (isCircuitCall) {
                        const args = parseCallArguments(argListNode, source);
                        let rawQubits = args[0] || '1';
                        if (rawQubits.includes('=')) {
                            const kw = args.find(a => a.startsWith('num_qubits='));
                            if (kw) rawQubits = kw.split('=')[1].trim();
                            else rawQubits = rawQubits.split('=')[1].trim();
                        }

                        let qubits = parseInt(rawQubits, 10);
                        if (isNaN(qubits) && preScope[rawQubits] !== undefined) {
                            qubits = Math.round(preScope[rawQubits]);
                        }
                        if (isNaN(qubits)) {
                            const evalQ = evalPythonExpr(rawQubits, preScope);
                            if (!isNaN(evalQ)) qubits = Math.round(evalQ);
                        }

                        if (!isNaN(qubits) && qubits > 0) {
                            const startLine = getLineFromOffset(child.from, lineOffsets);
                            let endLine = startLine;
                            const varPattern = new RegExp(`\\b${lhsText}\\b`);
                            for (let j = startLine + 1; j < rawLines.length; j++) {
                                if (varPattern.test(rawLines[j])) endLine = j;
                            }

                            return {
                                name: lhsText,
                                startLine,
                                endLine,
                                qubits
                            };
                        }
                    } else {
                        const val = evalPythonExpr(rhsText, preScope);
                        if (!isNaN(val)) {
                            preScope[lhsText] = val;
                        }
                    }
                }
            }
            child = child.nextSibling;
        }
    } catch {
        // Fallback to regex below if AST parse fails
    }

    // Fallback regex detection
    const classPattern = Array.from(validClassNames).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const circuitRe = new RegExp(`^(\\s*)(\\w+)\\s*=\\s*(?:\\w+\\.)*(?:${classPattern})\\s*\\(\\s*(?:num_qubits\\s*=\\s*)?([A-Za-z0-9_]+)`);
    const preScope = {};

    for (let i = 0; i < rawLines.length; i++) {
        const trimmed = rawLines[i].trim();
        const assignMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^#]+)/);
        if (assignMatch && !assignMatch[2].includes('QuantumCircuit')) {
            const val = evalPythonExpr(assignMatch[2].trim(), preScope);
            if (!isNaN(val)) preScope[assignMatch[1]] = val;
        }

        const match = rawLines[i].match(circuitRe);
        if (match) {
            const varName = match[2];
            const rawQubits = match[3];
            let qubits = parseInt(rawQubits, 10);
            if (isNaN(qubits) && preScope[rawQubits] !== undefined) {
                qubits = Math.round(preScope[rawQubits]);
            }
            if (isNaN(qubits) || qubits <= 0) continue;

            let endLine = i;
            const varPattern = new RegExp(`\\b${varName}\\b`);
            for (let j = i + 1; j < rawLines.length; j++) {
                if (varPattern.test(rawLines[j])) endLine = j;
            }

            return {
                name: varName,
                startLine: i,
                endLine,
                qubits
            };
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// 4. Gate definitions (unitary matrices)
// ---------------------------------------------------------------------------

const SQRT2_INV = 1 / Math.sqrt(2);

const GATES = {
    h: () => [c(SQRT2_INV), c(SQRT2_INV), c(SQRT2_INV), c(-SQRT2_INV)],
    x: () => [c(0), c(1), c(1), c(0)],
    y: () => [c(0), c(0, -1), c(0, 1), c(0)],
    z: () => [c(1), c(0), c(0), c(-1)],
    s: () => [c(1), c(0), c(0), c(0, 1)],
    sdg: () => [c(1), c(0), c(0), c(0, -1)],
    t: () => [c(1), c(0), c(0), cExp(Math.PI / 4)],
    tdg: () => [c(1), c(0), c(0), cExp(-Math.PI / 4)],
    sx: () => [c(0.5, 0.5), c(0.5, -0.5), c(0.5, -0.5), c(0.5, 0.5)],
    sxdg: () => [c(0.5, -0.5), c(0.5, 0.5), c(0.5, 0.5), c(0.5, -0.5)],
    id: () => [c(1), c(0), c(0), c(1)],
    i: () => [c(1), c(0), c(0), c(1)],

    rx: (theta) => {
        const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
        return [c(ct), c(0, -st), c(0, -st), c(ct)];
    },
    ry: (theta) => {
        const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
        return [c(ct), c(-st), c(st), c(ct)];
    },
    rz: (phi) => {
        return [cExp(-phi / 2), c(0), c(0), cExp(phi / 2)];
    },
    p: (theta) => [c(1), c(0), c(0), cExp(theta)],
    u1: (theta) => [c(1), c(0), c(0), cExp(theta)],
    u: (theta, phi, lam) => {
        const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
        return [
            c(ct),
            cMul(c(-st), cExp(lam)),
            cMul(c(st), cExp(phi)),
            cMul(c(ct), cExp(phi + lam))
        ];
    },
    u3: (theta, phi, lam) => GATES.u(theta, phi, lam),
    u2: (phi, lam) => {
        return [
            cScale(c(1), SQRT2_INV),
            cScale(cExp(lam), -SQRT2_INV),
            cScale(cExp(phi), SQRT2_INV),
            cScale(cExp(phi + lam), SQRT2_INV)
        ];
    }
};

// ---------------------------------------------------------------------------
// 5. State vector simulator engine
// ---------------------------------------------------------------------------

function apply1QGate(sv, N, target, matrix) {
    const size = 1 << N;
    const step = 1 << (N - 1 - target);
    for (let i = 0; i < size; i++) {
        if (i & step) continue;
        const j = i | step;
        const a0 = sv[i];
        const a1 = sv[j];
        sv[i] = cAdd(cMul(matrix[0], a0), cMul(matrix[1], a1));
        sv[j] = cAdd(cMul(matrix[2], a0), cMul(matrix[3], a1));
    }
}

function applyControlledGate(sv, N, ctrl, tgt, matrix) {
    const size = 1 << N;
    const ctrlBit = 1 << (N - 1 - ctrl);
    const tgtBit = 1 << (N - 1 - tgt);
    for (let i = 0; i < size; i++) {
        if (!(i & ctrlBit)) continue;
        if (i & tgtBit) continue;
        const j = i | tgtBit;
        const a0 = sv[i];
        const a1 = sv[j];
        sv[i] = cAdd(cMul(matrix[0], a0), cMul(matrix[1], a1));
        sv[j] = cAdd(cMul(matrix[2], a0), cMul(matrix[3], a1));
    }
}

function applyMultiControlledGate(sv, N, controlQubits, tgt, matrix) {
    const size = 1 << N;
    const tgtBit = 1 << (N - 1 - tgt);
    const ctrlMask = controlQubits.reduce((mask, q) => mask | (1 << (N - 1 - q)), 0);
    for (let i = 0; i < size; i++) {
        if ((i & ctrlMask) !== ctrlMask) continue;
        if (i & tgtBit) continue;
        const j = i | tgtBit;
        const a0 = sv[i];
        const a1 = sv[j];
        sv[i] = cAdd(cMul(matrix[0], a0), cMul(matrix[1], a1));
        sv[j] = cAdd(cMul(matrix[2], a0), cMul(matrix[3], a1));
    }
}

function applySWAP(sv, N, q1, q2) {
    const size = 1 << N;
    const bit1 = 1 << (N - 1 - q1);
    const bit2 = 1 << (N - 1 - q2);
    for (let i = 0; i < size; i++) {
        const b1 = (i & bit1) ? 1 : 0;
        const b2 = (i & bit2) ? 1 : 0;
        if (b1 === b2) continue;
        const j = i ^ bit1 ^ bit2;
        if (i < j) {
            const tmp = sv[i];
            sv[i] = sv[j];
            sv[j] = tmp;
        }
    }
}

function applyISWAP(sv, N, q1, q2) {
    const size = 1 << N;
    const bit1 = 1 << (N - 1 - q1);
    const bit2 = 1 << (N - 1 - q2);
    for (let i = 0; i < size; i++) {
        const b1 = (i & bit1) ? 1 : 0;
        const b2 = (i & bit2) ? 1 : 0;
        if (b1 === b2) continue;
        const j = i ^ bit1 ^ bit2;
        if (i < j) {
            const tmp = sv[i];
            sv[i] = cMul(c(0, 1), sv[j]);
            sv[j] = cMul(c(0, 1), tmp);
        }
    }
}

function applyECR(sv, N, q1, q2) {
    const size = 1 << N;
    const bit1 = 1 << (N - 1 - q1);
    const bit2 = 1 << (N - 1 - q2);
    for (let i = 0; i < size; i++) {
        if ((i & bit1) !== 0 || (i & bit2) !== 0) continue;
        const i00 = i;
        const i01 = i | bit2;
        const i10 = i | bit1;
        const i11 = i | bit1 | bit2;

        const a00 = sv[i00];
        const a01 = sv[i01];
        const a10 = sv[i10];
        const a11 = sv[i11];

        sv[i00] = cScale(cAdd(a10, cMul(c(0, 1), a11)), SQRT2_INV);
        sv[i01] = cScale(cAdd(cMul(c(0, 1), a10), a11), SQRT2_INV);
        sv[i10] = cScale(cAdd(a00, cMul(c(0, -1), a01)), SQRT2_INV);
        sv[i11] = cScale(cAdd(cMul(c(0, -1), a00), a01), SQRT2_INV);
    }
}

function applyDCX(sv, N, q1, q2) {
    applyControlledGate(sv, N, q1, q2, GATES.x());
    applyControlledGate(sv, N, q2, q1, GATES.x());
}

function applyRXX(sv, N, q1, q2, theta) {
    const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
    const size = 1 << N;
    const bit1 = 1 << (N - 1 - q1), bit2 = 1 << (N - 1 - q2);
    for (let i = 0; i < size; i++) {
        if ((i & bit1) !== 0 || (i & bit2) !== 0) continue;
        const i00 = i, i01 = i | bit2, i10 = i | bit1, i11 = i | bit1 | bit2;
        const a00 = sv[i00], a01 = sv[i01], a10 = sv[i10], a11 = sv[i11];
        const mist = c(0, -st);
        sv[i00] = cAdd(cScale(a00, ct), cMul(mist, a11));
        sv[i01] = cAdd(cScale(a01, ct), cMul(mist, a10));
        sv[i10] = cAdd(cScale(a10, ct), cMul(mist, a01));
        sv[i11] = cAdd(cScale(a11, ct), cMul(mist, a00));
    }
}

function applyRYY(sv, N, q1, q2, theta) {
    const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
    const size = 1 << N;
    const bit1 = 1 << (N - 1 - q1), bit2 = 1 << (N - 1 - q2);
    for (let i = 0; i < size; i++) {
        if ((i & bit1) !== 0 || (i & bit2) !== 0) continue;
        const i00 = i, i01 = i | bit2, i10 = i | bit1, i11 = i | bit1 | bit2;
        const a00 = sv[i00], a01 = sv[i01], a10 = sv[i10], a11 = sv[i11];
        sv[i00] = cAdd(cScale(a00, ct), cMul(c(0, st), a11));
        sv[i01] = cAdd(cScale(a01, ct), cMul(c(0, -st), a10));
        sv[i10] = cAdd(cScale(a10, ct), cMul(c(0, -st), a01));
        sv[i11] = cAdd(cScale(a11, ct), cMul(c(0, st), a00));
    }
}

function applyRZZ(sv, N, q1, q2, theta) {
    const size = 1 << N;
    const bit1 = 1 << (N - 1 - q1), bit2 = 1 << (N - 1 - q2);
    const ep = cExp(theta / 2), em = cExp(-theta / 2);
    for (let i = 0; i < size; i++) {
        const b1 = (i & bit1) ? 1 : 0, b2 = (i & bit2) ? 1 : 0;
        const parity = b1 ^ b2;
        sv[i] = cMul(sv[i], parity ? em : ep);
    }
}

function applyRZX(sv, N, q1, q2, theta) {
    const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
    const size = 1 << N;
    const bit1 = 1 << (N - 1 - q1), bit2 = 1 << (N - 1 - q2);
    for (let i = 0; i < size; i++) {
        if ((i & bit1) !== 0 || (i & bit2) !== 0) continue;
        const i00 = i, i01 = i | bit2, i10 = i | bit1, i11 = i | bit1 | bit2;
        const a00 = sv[i00], a01 = sv[i01], a10 = sv[i10], a11 = sv[i11];
        sv[i00] = cAdd(cScale(a00, ct), cMul(c(0, -st), a10));
        sv[i01] = cAdd(cMul(c(0, st), a11), cScale(a01, ct));
        sv[i10] = cAdd(cMul(c(0, -st), a00), cScale(a10, ct));
        sv[i11] = cAdd(cScale(a11, ct), cMul(c(0, st), a01));
    }
}

function applyReset(sv, N, qubit) {
    const size = 1 << N;
    const bit = 1 << (N - 1 - qubit);

    // For each pair of basis states differing only in `qubit`,
    // move the |1⟩ amplitude to the |0⟩ position, then zero out |1⟩.
    // This simulates measuring and conditionally flipping.
    for (let i = 0; i < size; i++) {
        if (!(i & bit)) continue;       // only process |1⟩ states
        const j = i ^ bit;              // corresponding |0⟩ state
        // Move amplitude from |1⟩ to |0⟩
        // For a pure state this is equivalent to measure + conditional X
        sv[j] = c(
            Math.sqrt(cAbs2(sv[j]) + cAbs2(sv[i])),
            0
        );
        sv[i] = c(0);
    }
}

function applyInitialize(sv, N, stateVec, qubits) {
    if (!qubits || qubits.length === N) {
        for (let i = 0; i < sv.length; i++) {
            if (i < stateVec.length) {
                const v = stateVec[i];
                sv[i] = typeof v === 'number' ? c(v) : c(v.re || v[0] || 0, v.im || v[1] || 0);
            } else {
                sv[i] = c(0);
            }
        }
        return;
    }

    if (qubits.length === 1 && stateVec.length === 2) {
        const q = qubits[0];
        applyReset(sv, N, q);
        const alpha = typeof stateVec[0] === 'number' ? c(stateVec[0]) : c(stateVec[0].re || 0, stateVec[0].im || 0);
        const beta = typeof stateVec[1] === 'number' ? c(stateVec[1]) : c(stateVec[1].re || 0, stateVec[1].im || 0);
        const matrix = [
            alpha,
            { re: -beta.re, im: beta.im },
            beta,
            { re: alpha.re, im: -alpha.im }
        ];
        apply1QGate(sv, N, q, matrix);
    }
}

// ---------------------------------------------------------------------------
// 6. Line & Statement Parsers
// ---------------------------------------------------------------------------

function parseIntList(s) {
    const m = s.match(/^\[([^\]]*)\]$/);
    if (!m) return null;
    return m[1].split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x));
}

function parseNumericList(s) {
    const m = s.match(/^\[([^\]]*)\]$/);
    if (!m) return null;
    return m[1].split(',').map(x => {
        const val = evalPythonExpr(x.trim());
        return isNaN(val) ? 0 : val;
    });
}

function evalQubit(arg, scope = {}) {
    if (arg == null) return NaN;
    const str = String(arg).trim();
    const val = evalPythonExpr(str, scope);
    if (!isNaN(val)) {
        return Math.round(val);
    }
    const parsed = parseInt(str, 10);
    return isNaN(parsed) ? NaN : parsed;
}

function evalQubitList(arg, scope = {}) {
    if (arg == null) return null;
    const str = String(arg).trim();
    if (str.startsWith('[') && str.endsWith(']')) {
        const items = parseArgs(str.slice(1, -1));
        const list = items.map(item => evalQubit(item, scope));
        return list.every(q => !isNaN(q)) ? list : null;
    }
    if (scope && Array.isArray(scope[str])) {
        return scope[str];
    }
    return null;
}

function evalNumericList(arg, scope = {}) {
    if (arg == null) return null;
    const str = String(arg).trim();
    if (str.startsWith('[') && str.endsWith(']')) {
        const items = parseArgs(str.slice(1, -1));
        return items.map(item => {
            const val = evalPythonExpr(item, scope);
            return isNaN(val) ? 0 : val;
        });
    }
    if (scope && Array.isArray(scope[str])) {
        return scope[str];
    }
    return null;
}

function evalIterable(expr, scope = {}) {
    if (expr == null) return null;
    let s = String(expr).trim();

    // reversed(...)
    const revMatch = s.match(/^reversed\s*\((.+)\)$/);
    if (revMatch) {
        const inner = evalIterable(revMatch[1], scope);
        return Array.isArray(inner) ? inner.slice().reverse() : null;
    }

    // range(...)
    const rangeMatch = s.match(/^range\s*\((.*)\)$/);
    if (rangeMatch) {
        const args = parseArgs(rangeMatch[1]);
        const vals = args.map(a => evalPythonExpr(a, scope));
        if (vals.some(v => isNaN(v))) return null;
        let start = 0, stop = 0, step = 1;
        if (vals.length === 1) {
            stop = Math.round(vals[0]);
        } else if (vals.length === 2) {
            start = Math.round(vals[0]);
            stop = Math.round(vals[1]);
        } else if (vals.length >= 3) {
            start = Math.round(vals[0]);
            stop = Math.round(vals[1]);
            step = Math.round(vals[2]);
        }
        if (step === 0) return null;
        const result = [];
        if (step > 0) {
            for (let v = start; v < stop; v += step) result.push(v);
        } else {
            for (let v = start; v > stop; v += step) result.push(v);
        }
        return result;
    }

    // enumerate(...)
    const enumMatch = s.match(/^enumerate\s*\((.+)\)$/);
    if (enumMatch) {
        const inner = evalIterable(enumMatch[1], scope);
        if (!Array.isArray(inner)) return null;
        return inner.map((item, idx) => [idx, item]);
    }

    // List or tuple literal: [0, 1, 2] or (0, 1, 2)
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('(') && s.endsWith(')'))) {
        const inner = s.slice(1, -1).trim();
        if (!inner) return [];
        const items = parseArgs(inner);
        return items.map(item => {
            const trimmedItem = item.trim();
            if ((trimmedItem.startsWith('(') && trimmedItem.endsWith(')')) ||
                (trimmedItem.startsWith('[') && trimmedItem.endsWith(']'))) {
                return parseArgs(trimmedItem.slice(1, -1)).map(x => {
                    const num = evalPythonExpr(x, scope);
                    return isNaN(num) ? x.trim() : num;
                });
            }
            const num = evalPythonExpr(trimmedItem, scope);
            return isNaN(num) ? trimmedItem : num;
        });
    }

    // Variable in scope
    if (scope && scope[s] !== undefined && Array.isArray(scope[s])) {
        return scope[s];
    }

    return null;
}

function bindLoopTarget(targetStr, item, scope) {
    let clean = targetStr.trim();
    if ((clean.startsWith('(') && clean.endsWith(')')) || (clean.startsWith('[') && clean.endsWith(']'))) {
        clean = clean.slice(1, -1).trim();
    }
    const vars = clean.split(',').map(v => v.trim()).filter(Boolean);
    if (vars.length === 1) {
        scope[vars[0]] = item;
    } else if (Array.isArray(item)) {
        for (let i = 0; i < vars.length; i++) {
            scope[vars[i]] = item[i];
        }
    }
}

function evalPythonCondition(expr, scope = {}) {
    let s = String(expr).trim();
    if (!s) return false;

    // Check 'x in [a, b, c]'
    const inMatch = s.match(/^([A-Za-z0-9_]+)\s+in\s+(.+)$/);
    if (inMatch) {
        const val = evalPythonExpr(inMatch[1], scope);
        const list = evalIterable(inMatch[2], scope);
        if (Array.isArray(list)) {
            return list.includes(val);
        }
    }

    s = s.replace(/\band\b/g, '&&')
        .replace(/\bor\b/g, '||')
        .replace(/\bnot\b/g, '!')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/==/g, '===')
        .replace(/!=/g, '!==');

    s = s.replace(/\bnp\.pi\b/g, String(Math.PI))
        .replace(/\bmath\.pi\b/g, String(Math.PI))
        .replace(/\bpi\b/g, String(Math.PI));

    const scopeKeys = Object.keys(scope).filter(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
    const scopeVals = scopeKeys.map(k => scope[k]);

    try {
        const fn = new Function('Math', ...scopeKeys, `"use strict"; return Boolean(${s});`);
        return Boolean(fn(Math, ...scopeVals));
    } catch {
        return false;
    }
}

function slice(node, source) {
    return source.slice(node.from, node.to);
}

function getBodyStatements(bodyNode) {
    if (!bodyNode) return [];
    const stmts = [];
    let child = bodyNode.firstChild;
    while (child) {
        if (child.name !== ':' && child.name !== 'Comment') {
            stmts.push(child);
        }
        child = child.nextSibling;
    }
    return stmts;
}

// ---------------------------------------------------------------------------
// 7. Main simulation entry point
// ---------------------------------------------------------------------------

function snapshotFromSv(sv, N) {
    return {
        qubits: N,
        amplitudes: sv.map(a => ({ re: a.re, im: a.im }))
    };
}

function areSnapshotsEqual(a, b, tolerance) {
    if (!a || !b) return false;
    if (a.qubits !== b.qubits) return false;
    const ampsA = a.amplitudes, ampsB = b.amplitudes;
    if (ampsA.length !== ampsB.length) return false;
    for (let i = 0; i < ampsA.length; i++) {
        if (Math.abs(ampsA[i].re - ampsB[i].re) > tolerance) return false;
        if (Math.abs(ampsA[i].im - ampsB[i].im) > tolerance) return false;
    }
    return true;
}

function isTrivialState(snapshot) {
    if (!snapshot || !snapshot.amplitudes || snapshot.amplitudes.length === 0) return true;
    const first = snapshot.amplitudes[0];
    if (Math.abs(first.re - 1) > 1e-9 || Math.abs(first.im) > 1e-9) return false;
    for (let i = 1; i < snapshot.amplitudes.length; i++) {
        if (Math.abs(snapshot.amplitudes[i].re) > 1e-9 || Math.abs(snapshot.amplitudes[i].im) > 1e-9) return false;
    }
    return true;
}

function applyCircuitGate(gate, args, ctx, scope, lineIdx, rawLine) {
    const sv = ctx.sv;
    const N = ctx.N;
    const size = ctx.size;
    let gateApplied = false;

    // --- Standard 1-qubit gates ---
    if (['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'sx', 'sxdg', 'id', 'i'].includes(gate)) {
        const qubit = evalQubit(args[0], scope);
        if (!isNaN(qubit) && qubit >= 0 && qubit < N) {
            apply1QGate(sv, N, qubit, GATES[gate]());
            gateApplied = true;
        }
    }
    else if (gate === 'not') {
        const qubit = evalQubit(args[0], scope);
        if (!isNaN(qubit) && qubit >= 0 && qubit < N) {
            apply1QGate(sv, N, qubit, GATES.x());
            gateApplied = true;
        }
    }
    // --- Parametric gates (rx, ry, rz support 1-qubit and controlled if 3 args passed) ---
    else if (['rx', 'ry', 'rz'].includes(gate)) {
        if (args.length >= 3) {
            const theta = evalPythonExpr(args[0], scope);
            const ctrl = evalQubit(args[1], scope), tgt = evalQubit(args[2], scope);
            if (!isNaN(theta) && !isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
                applyControlledGate(sv, N, ctrl, tgt, GATES[gate](theta));
                gateApplied = true;
            }
        } else {
            const theta = evalPythonExpr(args[0], scope);
            const qubit = evalQubit(args[1], scope);
            if (!isNaN(theta) && !isNaN(qubit) && qubit >= 0 && qubit < N) {
                apply1QGate(sv, N, qubit, GATES[gate](theta));
                gateApplied = true;
            }
        }
    }
    else if (gate === 'p' || gate === 'u1') {
        const theta = evalPythonExpr(args[0], scope);
        const qubit = evalQubit(args[1], scope);
        if (!isNaN(theta) && !isNaN(qubit) && qubit >= 0 && qubit < N) {
            apply1QGate(sv, N, qubit, GATES.p(theta));
            gateApplied = true;
        }
    }
    else if (gate === 'u' || gate === 'u3') {
        const theta = evalPythonExpr(args[0], scope);
        const phi = evalPythonExpr(args[1], scope);
        const lam = evalPythonExpr(args[2], scope);
        const qubit = evalQubit(args[3], scope);
        if (!isNaN(theta) && !isNaN(phi) && !isNaN(lam) && !isNaN(qubit) && qubit >= 0 && qubit < N) {
            apply1QGate(sv, N, qubit, GATES.u(theta, phi, lam));
            gateApplied = true;
        }
    }
    else if (gate === 'u2') {
        const phi = evalPythonExpr(args[0], scope);
        const lam = evalPythonExpr(args[1], scope);
        const qubit = evalQubit(args[2], scope);
        if (!isNaN(phi) && !isNaN(lam) && !isNaN(qubit) && qubit >= 0 && qubit < N) {
            apply1QGate(sv, N, qubit, GATES.u2(phi, lam));
            gateApplied = true;
        }
    }
    // --- 2-qubit controlled gates ---
    else if (gate === 'cx' || gate === 'cnot') {
        const ctrl = evalQubit(args[0], scope), tgt = evalQubit(args[1], scope);
        if (!isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            applyControlledGate(sv, N, ctrl, tgt, GATES.x());
            gateApplied = true;
        }
    }
    else if (gate === 'cy') {
        const ctrl = evalQubit(args[0], scope), tgt = evalQubit(args[1], scope);
        if (!isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            applyControlledGate(sv, N, ctrl, tgt, GATES.y());
            gateApplied = true;
        }
    }
    else if (gate === 'cz') {
        const ctrl = evalQubit(args[0], scope), tgt = evalQubit(args[1], scope);
        if (!isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            applyControlledGate(sv, N, ctrl, tgt, GATES.z());
            gateApplied = true;
        }
    }
    else if (gate === 'ch') {
        const ctrl = evalQubit(args[0], scope), tgt = evalQubit(args[1], scope);
        if (!isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            applyControlledGate(sv, N, ctrl, tgt, GATES.h());
            gateApplied = true;
        }
    }
    else if (gate === 'cp' || gate === 'cu1') {
        const theta = evalPythonExpr(args[0], scope);
        const ctrl = evalQubit(args[1], scope), tgt = evalQubit(args[2], scope);
        if (!isNaN(theta) && !isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            applyControlledGate(sv, N, ctrl, tgt, GATES.p(theta));
            gateApplied = true;
        }
    }
    else if (gate === 'crx') {
        const theta = evalPythonExpr(args[0], scope);
        const ctrl = evalQubit(args[1], scope), tgt = evalQubit(args[2], scope);
        if (!isNaN(theta) && !isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            applyControlledGate(sv, N, ctrl, tgt, GATES.rx(theta));
            gateApplied = true;
        }
    }
    else if (gate === 'cry') {
        const theta = evalPythonExpr(args[0], scope);
        const ctrl = evalQubit(args[1], scope), tgt = evalQubit(args[2], scope);
        if (!isNaN(theta) && !isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            applyControlledGate(sv, N, ctrl, tgt, GATES.ry(theta));
            gateApplied = true;
        }
    }
    else if (gate === 'crz') {
        const theta = evalPythonExpr(args[0], scope);
        const ctrl = evalQubit(args[1], scope), tgt = evalQubit(args[2], scope);
        if (!isNaN(theta) && !isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            applyControlledGate(sv, N, ctrl, tgt, GATES.rz(theta));
            gateApplied = true;
        }
    }
    else if (gate === 'cu') {
        const theta = evalPythonExpr(args[0], scope);
        const phi = evalPythonExpr(args[1], scope);
        const lam = evalPythonExpr(args[2], scope);
        const gamma = evalPythonExpr(args[3], scope);
        const ctrl = evalQubit(args[4], scope), tgt = evalQubit(args[5], scope);
        if (!isNaN(theta) && !isNaN(phi) && !isNaN(lam) && !isNaN(gamma) &&
            !isNaN(ctrl) && !isNaN(tgt) && ctrl >= 0 && ctrl < N && tgt >= 0 && tgt < N && ctrl !== tgt) {
            const uMatrix = GATES.u(theta, phi, lam);
            if (Math.abs(gamma) > 1e-12) {
                const phaseGate = [c(1), c(0), c(0), cExp(gamma)];
                apply1QGate(sv, N, ctrl, phaseGate);
            }
            applyControlledGate(sv, N, ctrl, tgt, uMatrix);
            gateApplied = true;
        }
    }
    // --- 2-qubit swap / special ---
    else if (gate === 'swap') {
        const q1 = evalQubit(args[0], scope), q2 = evalQubit(args[1], scope);
        if (!isNaN(q1) && !isNaN(q2) && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N && q1 !== q2) {
            applySWAP(sv, N, q1, q2);
            gateApplied = true;
        }
    }
    else if (gate === 'iswap') {
        const q1 = evalQubit(args[0], scope), q2 = evalQubit(args[1], scope);
        if (!isNaN(q1) && !isNaN(q2) && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N && q1 !== q2) {
            applyISWAP(sv, N, q1, q2);
            gateApplied = true;
        }
    }
    else if (gate === 'ecr') {
        const q1 = evalQubit(args[0], scope), q2 = evalQubit(args[1], scope);
        if (!isNaN(q1) && !isNaN(q2) && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N && q1 !== q2) {
            applyECR(sv, N, q1, q2);
            gateApplied = true;
        }
    }
    else if (gate === 'dcx') {
        const q1 = evalQubit(args[0], scope), q2 = evalQubit(args[1], scope);
        if (!isNaN(q1) && !isNaN(q2) && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N && q1 !== q2) {
            applyDCX(sv, N, q1, q2);
            gateApplied = true;
        }
    }
    else if (gate === 'rxx') {
        const theta = evalPythonExpr(args[0], scope);
        const q1 = evalQubit(args[1], scope), q2 = evalQubit(args[2], scope);
        if (!isNaN(theta) && !isNaN(q1) && !isNaN(q2) && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N && q1 !== q2) {
            applyRXX(sv, N, q1, q2, theta);
            gateApplied = true;
        }
    }
    else if (gate === 'ryy') {
        const theta = evalPythonExpr(args[0], scope);
        const q1 = evalQubit(args[1], scope), q2 = evalQubit(args[2], scope);
        if (!isNaN(theta) && !isNaN(q1) && !isNaN(q2) && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N && q1 !== q2) {
            applyRYY(sv, N, q1, q2, theta);
            gateApplied = true;
        }
    }
    else if (gate === 'rzz') {
        const theta = evalPythonExpr(args[0], scope);
        const q1 = evalQubit(args[1], scope), q2 = evalQubit(args[2], scope);
        if (!isNaN(theta) && !isNaN(q1) && !isNaN(q2) && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N && q1 !== q2) {
            applyRZZ(sv, N, q1, q2, theta);
            gateApplied = true;
        }
    }
    else if (gate === 'rzx') {
        const theta = evalPythonExpr(args[0], scope);
        const q1 = evalQubit(args[1], scope), q2 = evalQubit(args[2], scope);
        if (!isNaN(theta) && !isNaN(q1) && !isNaN(q2) && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N && q1 !== q2) {
            applyRZX(sv, N, q1, q2, theta);
            gateApplied = true;
        }
    }
    // --- 3-qubit / multi-qubit gates ---
    else if (gate === 'ccx' || gate === 'toffoli') {
        const c1 = evalQubit(args[0], scope), c2 = evalQubit(args[1], scope), tgt = evalQubit(args[2], scope);
        if (!isNaN(c1) && !isNaN(c2) && !isNaN(tgt) && c1 >= 0 && c1 < N && c2 >= 0 && c2 < N && tgt >= 0 && tgt < N) {
            applyMultiControlledGate(sv, N, [c1, c2], tgt, GATES.x());
            gateApplied = true;
        }
    }
    else if (gate === 'cswap' || gate === 'fredkin') {
        const ctrl = evalQubit(args[0], scope), q1 = evalQubit(args[1], scope), q2 = evalQubit(args[2], scope);
        if (!isNaN(ctrl) && !isNaN(q1) && !isNaN(q2) && ctrl >= 0 && ctrl < N && q1 >= 0 && q1 < N && q2 >= 0 && q2 < N) {
            const ctrlBit = 1 << (N - 1 - ctrl);
            const bit1 = 1 << (N - 1 - q1), bit2 = 1 << (N - 1 - q2);
            for (let i = 0; i < size; i++) {
                if (!(i & ctrlBit)) continue;
                const b1 = (i & bit1) ? 1 : 0, b2 = (i & bit2) ? 1 : 0;
                if (b1 === b2) continue;
                const j = i ^ bit1 ^ bit2;
                if (i < j) {
                    const tmp = sv[i];
                    sv[i] = sv[j];
                    sv[j] = tmp;
                }
            }
            gateApplied = true;
        }
    }
    else if (gate === 'mcx') {
        const controlList = evalQubitList(args[0], scope);
        const tgt = evalQubit(args[1], scope);
        if (controlList && !isNaN(tgt) && tgt >= 0 && tgt < N && controlList.every(q => q >= 0 && q < N)) {
            applyMultiControlledGate(sv, N, controlList, tgt, GATES.x());
            gateApplied = true;
        }
    }
    else if (gate === 'mcp') {
        const theta = evalPythonExpr(args[0], scope);
        const controlList = evalQubitList(args[1], scope);
        const tgt = evalQubit(args[2], scope);
        if (!isNaN(theta) && controlList && !isNaN(tgt) && tgt >= 0 && tgt < N && controlList.every(q => q >= 0 && q < N)) {
            applyMultiControlledGate(sv, N, controlList, tgt, GATES.p(theta));
            gateApplied = true;
        }
    }
    // --- State / utility ---
    else if (gate === 'reset') {
        const qubit = evalQubit(args[0], scope);
        if (!isNaN(qubit) && qubit >= 0 && qubit < N) {
            applyReset(sv, N, qubit);
            gateApplied = true;
        }
    }
    else if (gate === 'initialize') {
        const stateList = evalNumericList(args[0], scope);
        if (stateList) {
            let qubits = null;
            if (args.length > 1) {
                const singleQ = evalQubit(args[1], scope);
                if (!isNaN(singleQ)) {
                    qubits = [singleQ];
                } else {
                    qubits = evalQubitList(args[1], scope);
                }
            }
            applyInitialize(sv, N, stateList, qubits);
            gateApplied = true;
        }
    }
    else if (gate === 'barrier' || gate === 'measure' || gate === 'measure_all') {
        gateApplied = true;
    }

    if (gateApplied) {
        recordInstructionToQasm(gate, args, scope, ctx, lineIdx, rawLine);
        ctx.result.steps.push({
            line: lineIdx,
            range: { start: { line: lineIdx, character: 0 }, end: { line: lineIdx, character: (rawLine || '').length } },
            gate
        });
        const snapshot = snapshotFromSv(sv, N);
        if (!areSnapshotsEqual(snapshot, ctx.lastSnapshot, 1e-9)) {
            ctx.lastSnapshot = snapshot;
            ctx.result.states.push(snapshot);
        }
    }
}

function recordInstructionToQasm(gate, args, scope, ctx, lineIdx, rawLine) {
    if (!ctx.qasmProgram) return;
    const srcMap = { line: lineIdx, col: 0, file: 'main.py' };

    if (gate === 'reset') {
        const q = evalQubit(args[0], scope);
        if (!isNaN(q)) ctx.qasmProgram.addReset(q, srcMap, rawLine);
        return;
    }
    if (gate === 'barrier') {
        ctx.qasmProgram.addBarrier([], srcMap, rawLine);
        return;
    }
    if (gate === 'measure' || gate === 'measure_all') {
        return;
    }
    if (gate === 'initialize') {
        return;
    }

    let op = gate;
    let params = [];
    let qubits = [];

    if (['rx', 'ry', 'rz'].includes(gate)) {
        if (args.length >= 3) {
            op = 'c' + gate;
            params = [evalPythonExpr(args[0], scope)];
            qubits = [evalQubit(args[1], scope), evalQubit(args[2], scope)];
        } else {
            params = [evalPythonExpr(args[0], scope)];
            qubits = [evalQubit(args[1], scope)];
        }
    } else if (gate === 'p' || gate === 'u1') {
        op = 'p';
        params = [evalPythonExpr(args[0], scope)];
        qubits = [evalQubit(args[1], scope)];
    } else if (gate === 'u' || gate === 'u3') {
        op = 'u';
        params = [evalPythonExpr(args[0], scope), evalPythonExpr(args[1], scope), evalPythonExpr(args[2], scope)];
        qubits = [evalQubit(args[3], scope)];
    } else if (gate === 'u2') {
        op = 'u2';
        params = [evalPythonExpr(args[0], scope), evalPythonExpr(args[1], scope)];
        qubits = [evalQubit(args[2], scope)];
    } else if (gate === 'cp' || gate === 'cu1') {
        op = 'cp';
        params = [evalPythonExpr(args[0], scope)];
        qubits = [evalQubit(args[1], scope), evalQubit(args[2], scope)];
    } else if (['crx', 'cry', 'crz'].includes(gate)) {
        params = [evalPythonExpr(args[0], scope)];
        qubits = [evalQubit(args[1], scope), evalQubit(args[2], scope)];
    } else if (gate === 'cu') {
        params = [evalPythonExpr(args[0], scope), evalPythonExpr(args[1], scope), evalPythonExpr(args[2], scope)];
        qubits = [evalQubit(args[4], scope), evalQubit(args[5], scope)];
    } else if (['rxx', 'ryy', 'rzz', 'rzx'].includes(gate)) {
        params = [evalPythonExpr(args[0], scope)];
        qubits = [evalQubit(args[1], scope), evalQubit(args[2], scope)];
    } else if (gate === 'mcx') {
        const ctrl = evalQubitList(args[0], scope) || [];
        const tgt = evalQubit(args[1], scope);
        qubits = [...ctrl, tgt];
    } else if (gate === 'mcp') {
        params = [evalPythonExpr(args[0], scope)];
        const ctrl = evalQubitList(args[1], scope) || [];
        const tgt = evalQubit(args[2], scope);
        qubits = [...ctrl, tgt];
    } else if (gate === 'cswap' || gate === 'fredkin') {
        op = 'cswap';
        qubits = [evalQubit(args[0], scope), evalQubit(args[1], scope), evalQubit(args[2], scope)];
    } else if (gate === 'ccx' || gate === 'toffoli') {
        op = 'ccx';
        qubits = [evalQubit(args[0], scope), evalQubit(args[1], scope), evalQubit(args[2], scope)];
    } else if (gate === 'cx' || gate === 'cnot') {
        op = 'cx';
        qubits = [evalQubit(args[0], scope), evalQubit(args[1], scope)];
    } else if (gate === 'not') {
        op = 'x';
        qubits = [evalQubit(args[0], scope)];
    } else {
        qubits = args.map(a => evalQubit(a, scope)).filter(q => !isNaN(q));
    }

    if (qubits.every(q => !isNaN(q) && q >= 0)) {
        ctx.qasmProgram.addGate(op, qubits, params, srcMap, rawLine);
    }
}

const MAX_STEPS = 10000;

function executeAstNode(node, source, lineOffsets, rawLines, scope, ctx) {
    if (ctx.stopped || ctx.returning) return;
    if (ctx.result.steps.length >= MAX_STEPS) {
        ctx.result.error = 'Execution exceeded the 10,000-step safety limit.';
        ctx.stopped = true;
        return;
    }

    const lineIdx = getLineFromOffset(node.from, lineOffsets);
    if (ctx.hasTargetLine && lineIdx > ctx.targetLine) {
        ctx.stopped = true;
        return;
    }

    const nodeName = node.name;

    // 0. StatementGroup (multiple statements on a single line separated by semicolons)
    if (nodeName === 'StatementGroup') {
        let child = node.firstChild;
        while (child) {
            if (child.name !== ';' && child.name !== 'Comment') {
                executeAstNode(child, source, lineOffsets, rawLines, scope, ctx);
            }
            child = child.nextSibling;
        }
        return;
    }

    // 1. Function Definition: def func(params): ...
    if (nodeName === 'FunctionDefinition') {
        let child = node.firstChild;
        let funcName = '', params = [], bodyNode = null;
        while (child) {
            if (child.name === 'VariableName') {
                funcName = slice(child, source);
            } else if (child.name === 'ParamList') {
                let p = child.firstChild;
                while (p) {
                    if (p.name === 'VariableName') {
                        params.push(slice(p, source));
                    }
                    p = p.nextSibling;
                }
            } else if (child.name === 'Body') {
                bodyNode = child;
            }
            child = child.nextSibling;
        }
        if (funcName) {
            if (!ctx.functions) ctx.functions = {};
            ctx.functions[funcName] = { params, bodyNode, lineIdx };
        }
        // Do NOT execute function body at definition time!
        return;
    }

    // 2. Return statement
    if (nodeName === 'ReturnStatement') {
        ctx.returning = true;
        return;
    }

    // 3. For loop: for target in iterable: body
    if (nodeName === 'ForStatement') {
        let child = node.firstChild;
        let forToken = null, inToken = null, bodyNode = null;
        while (child) {
            if (child.name === 'for') forToken = child;
            else if (child.name === 'in') inToken = child;
            else if (child.name === 'Body') bodyNode = child;
            child = child.nextSibling;
        }

        if (forToken && inToken && bodyNode) {
            const target = source.slice(forToken.to, inToken.from).trim();
            const iterExpr = source.slice(inToken.to, bodyNode.from).trim();

            const items = evalIterable(iterExpr, scope);
            if (Array.isArray(items)) {
                const bodyStmts = getBodyStatements(bodyNode);
                for (const item of items) {
                    if (ctx.stopped || ctx.returning) break;
                    if (ctx.result.steps.length >= MAX_STEPS) {
                        ctx.result.error = 'Execution exceeded the 10,000-step safety limit.';
                        ctx.stopped = true;
                        break;
                    }
                    bindLoopTarget(target, item, scope);
                    for (const stmt of bodyStmts) {
                        executeAstNode(stmt, source, lineOffsets, rawLines, scope, ctx);
                    }
                }
            }
        }
        return;
    }

    // 4. If statement: if / elif / else
    if (nodeName === 'IfStatement') {
        const branches = [];
        let child = node.firstChild;
        let branchKeyword = null;
        while (child) {
            if (child.name === 'if' || child.name === 'elif' || child.name === 'else') {
                branchKeyword = child;
            } else if (child.name === 'Body') {
                const condStr = (branchKeyword && branchKeyword.name === 'else')
                    ? null
                    : (branchKeyword ? source.slice(branchKeyword.to, child.from).trim() : null);
                branches.push({ condStr, bodyNode: child });
            }
            child = child.nextSibling;
        }

        for (const branch of branches) {
            if (branch.condStr === null || evalPythonCondition(branch.condStr, scope)) {
                for (const stmt of getBodyStatements(branch.bodyNode)) {
                    executeAstNode(stmt, source, lineOffsets, rawLines, scope, ctx);
                }
                break;
            }
        }
        return;
    }

    // 5. Assignment statement: a = b or c, t = (1, 2)
    if (nodeName === 'AssignStatement') {
        let child = node.firstChild;
        let assignOp = null;
        while (child) {
            if (child.name === 'AssignOp') assignOp = child;
            child = child.nextSibling;
        }

        if (assignOp) {
            const lhs = source.slice(node.from, assignOp.from).trim();
            const rhs = source.slice(assignOp.to, node.to).trim();

            if (lhs.includes(',')) {
                const targets = parseArgs(lhs);
                const vals = evalIterable(rhs, scope);
                if (Array.isArray(vals) && vals.length === targets.length) {
                    for (let idx = 0; idx < targets.length; idx++) {
                        scope[targets[idx].trim()] = vals[idx];
                    }
                }
            } else if (lhs !== ctx.circuitVar) {
                if ((rhs.startsWith('[') && rhs.endsWith(']')) || (rhs.startsWith('(') && rhs.endsWith(')'))) {
                    const listVal = evalIterable(rhs, scope);
                    if (listVal != null) scope[lhs] = listVal;
                } else {
                    const num = evalPythonExpr(rhs, scope);
                    if (!isNaN(num)) scope[lhs] = num;
                }
            }
        }
        return;
    }

    // 6. ExpressionStatement (calls, gate operations, function invocations)
    if (nodeName === 'ExpressionStatement') {
        let exprNode = node.firstChild;
        while (exprNode && exprNode.name === 'Comment') exprNode = exprNode.nextSibling;
        if (!exprNode) return;

        if (exprNode.name === 'CallExpression') {
            let calleeNode = exprNode.firstChild;
            let argListNode = null;
            let next = calleeNode ? calleeNode.nextSibling : null;
            while (next) {
                if (next.name === 'ArgList') {
                    argListNode = next;
                    break;
                }
                next = next.nextSibling;
            }

            const callArgs = parseCallArguments(argListNode, source);

            // Case A: Member call on circuit variable: qc.gate(...)
            if (calleeNode && calleeNode.name === 'MemberExpression') {
                let objNode = calleeNode.firstChild;
                let propNode = calleeNode.lastChild;
                const objName = objNode ? slice(objNode, source).trim() : '';
                const propName = propNode ? slice(propNode, source).trim().toLowerCase() : '';

                if (objName === ctx.circuitVar) {
                    applyCircuitGate(propName, callArgs, ctx, scope, lineIdx, rawLines[lineIdx]);
                    return;
                }
            }

            // Case B: Direct function call: func(args...)
            if (calleeNode && calleeNode.name === 'VariableName') {
                const funcName = slice(calleeNode, source).trim();
                if (ctx.functions && ctx.functions[funcName]) {
                    const funcDef = ctx.functions[funcName];
                    let circuitParamName = null;
                    const callScope = Object.assign({}, scope);

                    const positionalArgs = [];
                    const kwArgs = {};
                    for (const arg of callArgs) {
                        const eqIdx = arg.indexOf('=');
                        if (eqIdx > 0) {
                            kwArgs[arg.slice(0, eqIdx).trim()] = arg.slice(eqIdx + 1).trim();
                        } else {
                            positionalArgs.push(arg.trim());
                        }
                    }

                    for (let argIdx = 0; argIdx < funcDef.params.length; argIdx++) {
                        const paramName = funcDef.params[argIdx];
                        let argRaw = undefined;
                        if (kwArgs[paramName] !== undefined) {
                            argRaw = kwArgs[paramName];
                        } else if (argIdx < positionalArgs.length) {
                            argRaw = positionalArgs[argIdx];
                        }
                        if (argRaw === undefined) continue;

                        const trimmedArg = argRaw.trim();
                        if (trimmedArg === ctx.circuitVar || (scope && scope[trimmedArg] === ctx.circuitVar)) {
                            circuitParamName = paramName;
                            callScope[paramName] = ctx.circuitVar;
                        } else if ((trimmedArg.startsWith('[') && trimmedArg.endsWith(']')) ||
                            (trimmedArg.startsWith('(') && trimmedArg.endsWith(')'))) {
                            callScope[paramName] = evalIterable(trimmedArg, scope);
                        } else {
                            const val = evalPythonExpr(trimmedArg, scope);
                            callScope[paramName] = !isNaN(val) ? val : trimmedArg;
                        }
                    }

                    // Only execute when called with the circuit passed
                    if (circuitParamName) {
                        const childCtx = Object.assign({}, ctx, {
                            circuitVar: circuitParamName,
                            returning: false
                        });
                        for (const stmt of getBodyStatements(funcDef.bodyNode)) {
                            executeAstNode(stmt, source, lineOffsets, rawLines, callScope, childCtx);
                        }
                        if (childCtx.stopped) ctx.stopped = true;
                    }
                    return;
                }
            }
        }
    }
}

function parseQiskit(source, targetLine) {
    const result = { qubitsDeclared: 0, qubitsList: [], states: [], steps: [] };

    if (!hasQiskitImport(source)) {
        result.error = 'No Qiskit import detected in Python file.';
        return result;
    }

    const circuit = findCircuitInit(source);
    if (!circuit) {
        result.error = 'No QuantumCircuit instance found.';
        return result;
    }

    const N = circuit.qubits;
    const circuitVar = circuit.name;
    result.qubitsDeclared = N;
    result.qubitsList = Array.from({ length: N }, (_, i) => `q${i}`);

    const size = 1 << N;
    const sv = Array.from({ length: size }, (_, i) => i === 0 ? c(1) : c(0));

    // Record initial ground state |0...0⟩ so un-executed or newly declared circuits initialize to |0...0⟩
    const initialSnapshot = snapshotFromSv(sv, N);
    result.states.push(initialSnapshot);

    const lineOffsets = computeLineOffsets(source);
    const rawLines = source.split('\n');
    const hasTargetLine = typeof targetLine === 'number' && targetLine >= 0;

    const qasmProgram = new OpenQasmProgram();
    qasmProgram.addQreg('q', N);

    const ctx = {
        sv,
        N,
        size,
        circuitVar,
        hasTargetLine,
        targetLine,
        result,
        lastSnapshot: initialSnapshot,
        stopped: false,
        returning: false,
        functions: {},
        qasmProgram
    };

    const scope = {
        __name__: '__main__'
    };

    const tree = parser.parse(source);
    let child = tree.topNode.firstChild;
    while (child) {
        if (ctx.stopped) break;
        if (child.name !== 'Comment') {
            const lineIdx = getLineFromOffset(child.from, lineOffsets);
            if (ctx.hasTargetLine && lineIdx > ctx.targetLine) {
                ctx.stopped = true;
                break;
            }

            // If this is the circuit init line, we don't execute it as a gate or re-assignment
            if (lineIdx === circuit.startLine && child.name === 'AssignStatement') {
                // Circuit already initialized above
            } else {
                executeAstNode(child, source, lineOffsets, rawLines, scope, ctx);
            }
        }
        child = child.nextSibling;
    }

    // Strip leading trivial |0...0⟩ states (same as Q# runtime)
    while (result.states.length > 1 && isTrivialState(result.states[0])) {
        result.states.shift();
    }

    if (ctx.qasmProgram) {
        result.qasmProgram = ctx.qasmProgram;
        result.qasm = ctx.qasmProgram.toQasm2String();
    }

    return result;
}

// ---------------------------------------------------------------------------
// 8. Exports
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
    window.parseQiskit = parseQiskit;
}

export {
    parseQiskit,
    hasQiskitImport,
    findCircuitInit,
    evalPythonExpr,
    evalIterable,
    GATES,
    apply1QGate,
    applyControlledGate,
    applyMultiControlledGate,
    applySWAP
};

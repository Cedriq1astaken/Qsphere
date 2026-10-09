/**
 * Unified OpenQASM Quantum State Simulator
 *
 * Executes an OpenQasmProgram (or raw OpenQASM string) on an ideal statevector
 * simulator, recording step-by-step state snapshots for visualization.
 *
 * Output matches the visualizer standard schema:
 *   { qubitsDeclared, qubitsList, states, steps, qasm, qasmProgram }
 */

import { parseOpenQasm } from '../qasm/qasmParser.js';
import { OpenQasmProgram } from '../qasm/ir.js';
import { isTrivialState } from '../math/index.js';

// Complex helpers
function c(re = 0, im = 0) { return { re, im }; }
function cAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function cMul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cScale(a, s) { return { re: a.re * s, im: a.im * s }; }
function cExp(theta) { return { re: Math.cos(theta), im: Math.sin(theta) }; }
function cAbs2(a) { return a.re * a.re + a.im * a.im; }

const SQRT2_INV = Math.SQRT1_2;

// Standard single-qubit gate 2x2 matrices: [m00, m01, m10, m11]
export const SIMULATOR_GATES = {
    h: () => [c(SQRT2_INV), c(SQRT2_INV), c(SQRT2_INV), c(-SQRT2_INV)],
    x: () => [c(0), c(1), c(1), c(0)],
    y: () => [c(0), c(0, -1), c(0, 1), c(0)],
    z: () => [c(1), c(0), c(0), c(-1)],
    s: () => [c(1), c(0), c(0), c(0, 1)],
    sdg: () => [c(1), c(0), c(0), c(0, -1)],
    t: () => [c(1), c(0), c(0), cExp(Math.PI / 4)],
    tdg: () => [c(1), c(0), c(0), cExp(-Math.PI / 4)],
    sx: () => [cScale(c(1, 1), 0.5), cScale(c(1, -1), 0.5), cScale(c(1, -1), 0.5), cScale(c(1, 1), 0.5)],
    sxdg: () => [cScale(c(1, -1), 0.5), cScale(c(1, 1), 0.5), cScale(c(1, 1), 0.5), cScale(c(1, -1), 0.5)],
    id: () => [c(1), c(0), c(0), c(1)],

    rx: (theta) => {
        const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
        return [c(ct), c(0, -st), c(0, -st), c(ct)];
    },
    ry: (theta) => {
        const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
        return [c(ct), c(-st), c(st), c(ct)];
    },
    rz: (theta) => [cExp(-theta / 2), c(0), c(0), cExp(theta / 2)],
    p: (theta) => [c(1), c(0), c(0), cExp(theta)],

    u: (theta, phi, lambda) => {
        const ct = Math.cos(theta / 2), st = Math.sin(theta / 2);
        return [
            c(ct),
            cScale(cExp(lambda), -st),
            cScale(cExp(phi), st),
            cMul(cExp(phi + lambda), c(ct))
        ];
    },
    u2: (phi, lambda) => {
        return [
            c(SQRT2_INV),
            cScale(cExp(lambda), -SQRT2_INV),
            cScale(cExp(phi), SQRT2_INV),
            cMul(cExp(phi + lambda), c(SQRT2_INV))
        ];
    }
};

function apply1Q(sv, N, q, m) {
    const size = 1 << N;
    const step = 1 << (N - 1 - q);
    for (let i = 0; i < size; i += 2 * step) {
        for (let j = i; j < i + step; j++) {
            const a0 = sv[j];
            const a1 = sv[j + step];
            sv[j] = cAdd(cMul(m[0], a0), cMul(m[1], a1));
            sv[j + step] = cAdd(cMul(m[2], a0), cMul(m[3], a1));
        }
    }
}

function applyControlled(sv, N, ctrl, tgt, m) {
    const size = 1 << N;
    const ctrlBit = 1 << (N - 1 - ctrl);
    const tgtBit = 1 << (N - 1 - tgt);
    for (let i = 0; i < size; i++) {
        if (!(i & ctrlBit)) continue;
        if (i & tgtBit) continue;
        const j = i | tgtBit;
        const a0 = sv[i];
        const a1 = sv[j];
        sv[i] = cAdd(cMul(m[0], a0), cMul(m[1], a1));
        sv[j] = cAdd(cMul(m[2], a0), cMul(m[3], a1));
    }
}

function applyMultiControlled(sv, N, controlQubits, tgt, m) {
    const size = 1 << N;
    const tgtBit = 1 << (N - 1 - tgt);
    const ctrlMask = controlQubits.reduce((mask, q) => mask | (1 << (N - 1 - q)), 0);
    for (let i = 0; i < size; i++) {
        if ((i & ctrlMask) !== ctrlMask) continue;
        if (i & tgtBit) continue;
        const j = i | tgtBit;
        const a0 = sv[i];
        const a1 = sv[j];
        sv[i] = cAdd(cMul(m[0], a0), cMul(m[1], a1));
        sv[j] = cAdd(cMul(m[2], a0), cMul(m[3], a1));
    }
}

function applySwap(sv, N, q1, q2) {
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

function applyReset(sv, N, qubit) {
    const size = 1 << N;
    const bit = 1 << (N - 1 - qubit);
    for (let i = 0; i < size; i++) {
        if (!(i & bit)) continue;
        const j = i ^ bit;
        sv[j] = c(Math.sqrt(cAbs2(sv[j]) + cAbs2(sv[i])), 0);
        sv[i] = c(0);
    }
}

function snapshotFromSv(sv, N) {
    return {
        qubits: N,
        amplitudes: sv.map(a => ({ re: a.re, im: a.im }))
    };
}

function areSnapshotsEqual(a, b, tolerance = 1e-9) {
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

/**
 * Simulates an OpenQasmProgram on a statevector.
 * @param {OpenQasmProgram|string} programOrSource
 * @param {number} [targetLine] - Optional line inspection limit
 * @param {string} [fileName='circuit.qasm']
 * @returns {Object} { qubitsDeclared, qubitsList, states, steps, qasm, qasmProgram }
 */
export function simulateOpenQasm(programOrSource, targetLine = undefined, fileName = 'circuit.qasm') {
    const program = typeof programOrSource === 'string'
        ? parseOpenQasm(programOrSource, fileName)
        : programOrSource;

    const N = Math.max(1, program.qubitsCount);
    const size = 1 << N;
    const sv = Array.from({ length: size }, (_, i) => i === 0 ? c(1) : c(0));

    const result = {
        qubitsDeclared: N,
        qubitsList: Array.from({ length: N }, (_, i) => `q${i}`),
        states: [],
        steps: [],
        qasm: program.toQasm2String(),
        qasmProgram: program
    };

    const initialSnapshot = snapshotFromSv(sv, N);
    result.states.push(initialSnapshot);
    let lastSnapshot = initialSnapshot;

    const instructions = program.getInstructionsUpToLine(targetLine);

    for (const instr of instructions) {
        let gateApplied = false;
        const op = instr.op;
        const q = instr.qubits;
        const p = instr.params;

        // Reset
        if (instr.type === 'reset' && q.length > 0) {
            applyReset(sv, N, q[0]);
            gateApplied = true;
        }
        // Barriers & Measures (no-op on statevector)
        else if (instr.type === 'barrier' || instr.type === 'measure') {
            gateApplied = true;
        }
        // Gates
        else if (instr.type === 'gate') {
            // Single-qubit standard
            if (['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'sx', 'sxdg', 'id'].includes(op) && q.length >= 1) {
                apply1Q(sv, N, q[0], SIMULATOR_GATES[op]());
                gateApplied = true;
            }
            // Single-qubit parametric
            else if (['rx', 'ry', 'rz'].includes(op) && q.length >= 1) {
                const theta = p[0] ?? 0;
                apply1Q(sv, N, q[0], SIMULATOR_GATES[op](theta));
                gateApplied = true;
            }
            else if (op === 'p' && q.length >= 1) {
                apply1Q(sv, N, q[0], SIMULATOR_GATES.p(p[0] ?? 0));
                gateApplied = true;
            }
            else if (op === 'u' && q.length >= 1) {
                apply1Q(sv, N, q[0], SIMULATOR_GATES.u(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0));
                gateApplied = true;
            }
            else if (op === 'u2' && q.length >= 1) {
                apply1Q(sv, N, q[0], SIMULATOR_GATES.u2(p[0] ?? 0, p[1] ?? 0));
                gateApplied = true;
            }
            // Two-qubit controlled
            else if (op === 'cx' && q.length >= 2) {
                applyControlled(sv, N, q[0], q[1], SIMULATOR_GATES.x());
                gateApplied = true;
            }
            else if (op === 'cz' && q.length >= 2) {
                applyControlled(sv, N, q[0], q[1], SIMULATOR_GATES.z());
                gateApplied = true;
            }
            else if (op === 'cy' && q.length >= 2) {
                applyControlled(sv, N, q[0], q[1], SIMULATOR_GATES.y());
                gateApplied = true;
            }
            else if (op === 'ch' && q.length >= 2) {
                applyControlled(sv, N, q[0], q[1], SIMULATOR_GATES.h());
                gateApplied = true;
            }
            else if (op === 'crx' && q.length >= 2) {
                applyControlled(sv, N, q[0], q[1], SIMULATOR_GATES.rx(p[0] ?? 0));
                gateApplied = true;
            }
            else if (op === 'cry' && q.length >= 2) {
                applyControlled(sv, N, q[0], q[1], SIMULATOR_GATES.ry(p[0] ?? 0));
                gateApplied = true;
            }
            else if (op === 'crz' && q.length >= 2) {
                applyControlled(sv, N, q[0], q[1], SIMULATOR_GATES.rz(p[0] ?? 0));
                gateApplied = true;
            }
            else if (op === 'cp' && q.length >= 2) {
                applyControlled(sv, N, q[0], q[1], SIMULATOR_GATES.p(p[0] ?? 0));
                gateApplied = true;
            }
            else if (op === 'swap' && q.length >= 2) {
                applySwap(sv, N, q[0], q[1]);
                gateApplied = true;
            }
            // Three-qubit controlled
            else if (op === 'ccx' && q.length >= 3) {
                applyMultiControlled(sv, N, [q[0], q[1]], q[2], SIMULATOR_GATES.x());
                gateApplied = true;
            }
            else if (op === 'cswap' && q.length >= 3) {
                const ctrlBit = 1 << (N - 1 - q[0]);
                const bit1 = 1 << (N - 1 - q[1]), bit2 = 1 << (N - 1 - q[2]);
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
            else if (op === 'mcx' && q.length >= 2) {
                const controls = q.slice(0, -1);
                const tgt = q[q.length - 1];
                applyMultiControlled(sv, N, controls, tgt, SIMULATOR_GATES.x());
                gateApplied = true;
            }
        }

        if (gateApplied) {
            const line = instr.source?.line ?? 0;
            result.steps.push({
                line,
                gate: instr.op
            });
            const snap = snapshotFromSv(sv, N);
            if (!areSnapshotsEqual(snap, lastSnapshot, 1e-9)) {
                lastSnapshot = snap;
                result.states.push(snap);
            }
        }
    }

    while (result.states.length > 1 && isTrivialState(result.states[0])) {
        result.states.shift();
    }

    return result;
}

if (typeof window !== 'undefined') {
    window.simulateOpenQasm = simulateOpenQasm;
}

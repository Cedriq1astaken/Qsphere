/**
 * OpenQASM Emitter
 *
 * Converts runtime representations from Q# (getCircuit component grid) and
 * Qiskit Python AST into the normalized OpenQasmProgram intermediate representation.
 */

import { OpenQasmProgram, QasmInstruction, normalizeGateName } from './ir.js';

/**
 * Converts a Q# circuit structure (from debugService.getCircuit()) into an OpenQasmProgram.
 * @param {Object} circuitData - Object returned by qsharp debugService.getCircuit()
 * @param {string} [fileName='main.qs']
 * @returns {OpenQasmProgram}
 */
export function emitQasmFromQSharpCircuit(circuitData, fileName = 'main.qs') {
    const program = new OpenQasmProgram();
    if (!circuitData) return program;

    const circuit = Array.isArray(circuitData.circuits) ? circuitData.circuits[0] : circuitData;
    if (!circuit) return program;

    const qubits = circuit.qubits || [];
    const numQubits = Math.max(qubits.length, 0);
    if (numQubits > 0) {
        program.addQreg('q', numQubits);
    }

    const grid = circuit.componentGrid || [];
    for (const column of grid) {
        const components = column.components || [];
        for (const comp of components) {
            const kind = comp.kind;
            const gateName = (comp.gate || '').trim();
            const targets = (comp.targets || []).map(t => t.qubit);
            const controls = (comp.controls || []).map(c => c.qubit);
            const args = (comp.args || []).map(a => Number.parseFloat(a)).filter(n => Number.isFinite(n));

            const src = comp.metadata?.source || {};
            const sourceMap = {
                file: src.file || fileName,
                line: typeof src.line === 'number' ? src.line : 0,
                col: typeof src.column === 'number' ? src.column : 0
            };

            // 1. Reset / Ket initialization
            if (kind === 'ket') {
                for (const t of targets) {
                    program.addReset(t, sourceMap, `Reset(${t})`);
                }
                continue;
            }

            // 2. Measure
            if (kind === 'measure') {
                for (let i = 0; i < targets.length; i++) {
                    program.addMeasure(targets[i], targets[i], sourceMap, `M(q[${targets[i]}])`);
                }
                continue;
            }

            // 3. Unitary gates
            if (kind === 'unitary') {
                let op = gateName.toLowerCase();
                let combinedQubits = [];

                if (controls.length > 0) {
                    // Controlled gate
                    if (controls.length === 1 && op === 'x') {
                        op = 'cx';
                        combinedQubits = [controls[0], targets[0]];
                    } else if (controls.length === 1 && op === 'z') {
                        op = 'cz';
                        combinedQubits = [controls[0], targets[0]];
                    } else if (controls.length === 1 && op === 'y') {
                        op = 'cy';
                        combinedQubits = [controls[0], targets[0]];
                    } else if (controls.length === 1 && op === 'swap') {
                        op = 'cswap';
                        combinedQubits = [controls[0], ...targets];
                    } else if (controls.length === 2 && op === 'x') {
                        op = 'ccx';
                        combinedQubits = [controls[0], controls[1], targets[0]];
                    } else if (controls.length > 2 && op === 'x') {
                        op = 'mcx';
                        combinedQubits = [...controls, targets[0]];
                    } else if (controls.length === 1 && op.startsWith('r')) {
                        op = 'c' + op; // e.g. crz, cry, crx
                        combinedQubits = [controls[0], targets[0]];
                    } else {
                        // Generic controlled gate fallback
                        op = 'c' + op;
                        combinedQubits = [...controls, ...targets];
                    }
                } else {
                    // Non-controlled gate
                    combinedQubits = targets.slice();
                    if (op === 'swap' && targets.length < 2) {
                        // In Q#, SWAP targets array has both qubits
                        combinedQubits = targets;
                    }
                }

                if (combinedQubits.length > 0) {
                    const maxQ = Math.max(...combinedQubits);
                    if (maxQ >= program.qubitsCount) {
                        program.qubitsCount = maxQ + 1;
                    }
                    program.addGate(normalizeGateName(op), combinedQubits, args, sourceMap, comp.gate);
                }
            }
        }
    }

    return program;
}

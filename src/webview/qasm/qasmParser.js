/**
 * OpenQASM 2.0 & 3.0 Parser
 *
 * Lightweight, zero-dependency parser that converts OpenQASM source text
 * into an OpenQasmProgram intermediate representation with precise line mappings.
 */

import { OpenQasmProgram, normalizeGateName } from './ir.js';

const MATH_CONSTANTS = {
    pi: Math.PI,
    PI: Math.PI,
    e: Math.E,
    E: Math.E
};

const MATH_FUNCS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    sqrt: Math.sqrt,
    exp: Math.exp,
    log: Math.log,
    abs: Math.abs
};

/**
 * Safely evaluates mathematical parameter expressions in gate definitions
 * (e.g. "pi/2", "3*pi/4", "-pi", "sqrt(2)").
 * @param {string} expr
 * @returns {number}
 */
export function evalQasmExpr(expr) {
    if (expr == null) return NaN;
    const s = String(expr).trim();
    if (!s) return NaN;

    // Direct numeric literal check
    const num = Number(s);
    if (!Number.isNaN(num)) return num;

    // Validate tokens to prevent arbitrary code execution
    const sanitized = s.replace(/[A-Za-z_][A-Za-z0-9_]*/g, match => {
        if (match in MATH_CONSTANTS || match in MATH_FUNCS) return '';
        return match;
    });

    if (/[^0-9eE.\-+*/()% \t,]/.test(sanitized)) {
        return NaN;
    }

    try {
        const fn = new Function(
            'pi', 'PI', 'e', 'E',
            'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'exp', 'log', 'abs',
            `"use strict"; return (${s});`
        );
        const result = fn(
            Math.PI, Math.PI, Math.E, Math.E,
            Math.sin, Math.cos, Math.tan, Math.asin, Math.acos, Math.atan, Math.sqrt, Math.exp, Math.log, Math.abs
        );
        return typeof result === 'number' ? result : NaN;
    } catch {
        return NaN;
    }
}

/**
 * Parses an OpenQASM source string into an OpenQasmProgram.
 * @param {string} source - OpenQASM source code
 * @param {string} [fileName='circuit.qasm']
 * @returns {OpenQasmProgram}
 */
export function parseOpenQasm(source, fileName = 'circuit.qasm') {
    const program = new OpenQasmProgram();
    if (!source || typeof source !== 'string') return program;

    const rawLines = source.split('\n');
    const qregMap = new Map(); // regName -> { offset, size }
    const cregMap = new Map(); // regName -> { offset, size }

    // Helper to resolve a qubit token (e.g. "q[0]" or "q") to global qubit index
    function resolveQubitIndex(token) {
        token = token.trim();
        const indexedMatch = token.match(/^([A-Za-z_][A-Za-z0-9_]*)\[\s*(\d+)\s*\]$/);
        if (indexedMatch) {
            const name = indexedMatch[1];
            const idx = parseInt(indexedMatch[2], 10);
            const reg = qregMap.get(name);
            if (reg) {
                return reg.offset + idx;
            }
            return idx;
        }

        // Entire register or raw integer
        const rawInt = parseInt(token, 10);
        if (!isNaN(rawInt)) return rawInt;

        const reg = qregMap.get(token);
        if (reg && reg.size === 1) return reg.offset;

        return NaN;
    }

    // Helper to resolve a classical bit token (e.g. "c[0]") to global bit index
    function resolveBitIndex(token) {
        token = token.trim();
        const indexedMatch = token.match(/^([A-Za-z_][A-Za-z0-9_]*)\[\s*(\d+)\s*\]$/);
        if (indexedMatch) {
            const name = indexedMatch[1];
            const idx = parseInt(indexedMatch[2], 10);
            const reg = cregMap.get(name);
            if (reg) {
                return reg.offset + idx;
            }
            return idx;
        }
        const rawInt = parseInt(token, 10);
        if (!isNaN(rawInt)) return rawInt;
        return 0;
    }

    // Process statements. Statements end with semicolons, but can span multiple lines.
    // We maintain line mapping by tracking character indices.
    let currentStatement = '';
    let statementStartLine = 0;

    for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
        const fullLine = rawLines[lineIdx];
        // Strip comments (// ...)
        const commentIdx = fullLine.indexOf('//');
        const codeLine = commentIdx >= 0 ? fullLine.slice(0, commentIdx) : fullLine;

        for (let i = 0; i < codeLine.length; i++) {
            const ch = codeLine[i];
            if (currentStatement.trim().length === 0) {
                statementStartLine = lineIdx;
            }

            if (ch === ';') {
                const stmt = currentStatement.trim();
                currentStatement = '';
                if (stmt.length > 0) {
                    processStatement(stmt, statementStartLine);
                }
            } else {
                currentStatement += ch;
            }
        }
    }

    function processStatement(stmt, lineNum) {
        const sourceMap = { file: fileName, line: lineNum, col: 0 };

        // 1. Header / includes
        if (/^OPENQASM\s+/i.test(stmt) || /^include\s+/i.test(stmt)) {
            return;
        }

        // 2. Quantum register declaration (OpenQASM 2: qreg q[2]; OpenQASM 3: qubit[2] q;)
        const qregMatch2 = stmt.match(/^qreg\s+([A-Za-z_][A-Za-z0-9_]*)\[\s*(\d+)\s*\]$/);
        if (qregMatch2) {
            const name = qregMatch2[1];
            const size = parseInt(qregMatch2[2], 10);
            const offset = program.addQreg(name, size);
            qregMap.set(name, { offset, size });
            return;
        }

        const qregMatch3 = stmt.match(/^qubit\[\s*(\d+)\s*\]\s+([A-Za-z_][A-Za-z0-9_]*)$/);
        if (qregMatch3) {
            const size = parseInt(qregMatch3[1], 10);
            const name = qregMatch3[2];
            const offset = program.addQreg(name, size);
            qregMap.set(name, { offset, size });
            return;
        }

        const qregSingle3 = stmt.match(/^qubit\s+([A-Za-z_][A-Za-z0-9_]*)$/);
        if (qregSingle3) {
            const name = qregSingle3[1];
            const offset = program.addQreg(name, 1);
            qregMap.set(name, { offset, size: 1 });
            return;
        }

        // 3. Classical register declaration (creg c[2]; bit[2] c;)
        const cregMatch2 = stmt.match(/^creg\s+([A-Za-z_][A-Za-z0-9_]*)\[\s*(\d+)\s*\]$/);
        if (cregMatch2) {
            const name = cregMatch2[1];
            const size = parseInt(cregMatch2[2], 10);
            const offset = program.addCreg(name, size);
            cregMap.set(name, { offset, size });
            return;
        }

        const cregMatch3 = stmt.match(/^bit\[\s*(\d+)\s*\]\s+([A-Za-z_][A-Za-z0-9_]*)$/);
        if (cregMatch3) {
            const size = parseInt(cregMatch3[1], 10);
            const name = cregMatch3[2];
            const offset = program.addCreg(name, size);
            cregMap.set(name, { offset, size });
            return;
        }

        // 4. Reset
        const resetMatch = stmt.match(/^reset\s+(.+)$/);
        if (resetMatch) {
            const targetQ = resolveQubitIndex(resetMatch[1]);
            if (!isNaN(targetQ)) {
                program.addReset(targetQ, sourceMap, stmt);
            }
            return;
        }

        // 5. Barrier
        const barrierMatch = stmt.match(/^barrier(?:\s+(.+))?$/);
        if (barrierMatch) {
            const args = barrierMatch[1] ? barrierMatch[1].split(',').map(s => resolveQubitIndex(s)).filter(q => !isNaN(q)) : [];
            program.addBarrier(args, sourceMap, stmt);
            return;
        }

        // 6. Measure (measure q[0] -> c[0];)
        const measureMatch = stmt.match(/^measure\s+([^->]+)\s*->\s*(.+)$/);
        if (measureMatch) {
            const q = resolveQubitIndex(measureMatch[1]);
            const b = resolveBitIndex(measureMatch[2]);
            if (!isNaN(q)) {
                program.addMeasure(q, b, sourceMap, stmt);
            }
            return;
        }

        // 7. Standard & Parameterized Gate:
        // Examples:
        //   h q[0];
        //   cx q[0], q[1];
        //   rz(pi/4) q[0];
        //   u(pi/2, 0, pi) q[0];
        const gateMatch = stmt.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?\s+(.+)$/);
        if (gateMatch) {
            const rawOp = gateMatch[1];
            const rawParams = gateMatch[2];
            const rawQubits = gateMatch[3];

            const op = normalizeGateName(rawOp);
            const params = rawParams
                ? rawParams.split(',').map(p => evalQasmExpr(p.trim())).filter(p => !isNaN(p))
                : [];
            const qubits = rawQubits
                ? rawQubits.split(',').map(q => resolveQubitIndex(q.trim())).filter(q => !isNaN(q))
                : [];

            if (qubits.length > 0) {
                // If qubitsCount wasn't explicitly declared, auto-expand to accommodate
                const maxQ = Math.max(...qubits);
                if (maxQ >= program.qubitsCount) {
                    program.qubitsCount = maxQ + 1;
                }
                program.addGate(op, qubits, params, sourceMap, stmt);
            }
        }
    }

    return program;
}

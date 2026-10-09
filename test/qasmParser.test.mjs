import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { OpenQasmProgram, QasmInstruction, CANONICAL_GATE_NAMES } from '../src/webview/qasm/ir.js';
import { parseOpenQasm, evalQasmExpr } from '../src/webview/qasm/qasmParser.js';

describe('OpenQASM IR & Parser Suite', () => {
    test('evalQasmExpr evaluates arithmetic and constants', () => {
        assert.strictEqual(evalQasmExpr('0'), 0);
        assert.strictEqual(evalQasmExpr('1.5'), 1.5);
        assert.ok(Math.abs(evalQasmExpr('pi') - Math.PI) < 1e-9);
        assert.ok(Math.abs(evalQasmExpr('pi / 2') - Math.PI / 2) < 1e-9);
        assert.ok(Math.abs(evalQasmExpr('3 * pi / 4') - (3 * Math.PI / 4)) < 1e-9);
        assert.ok(Math.abs(evalQasmExpr('-pi') - (-Math.PI)) < 1e-9);
        assert.ok(Math.abs(evalQasmExpr('cos(0)') - 1) < 1e-9);
        assert.ok(Math.abs(evalQasmExpr('sin(pi / 2)') - 1) < 1e-9);
        assert.ok(Number.isNaN(evalQasmExpr('invalid_token')));
    });

    test('Parses standard OpenQASM 2.0 Bell State program', () => {
        const qasm = `
        OPENQASM 2.0;
        include "qelib1.inc";

        qreg q[2];
        creg c[2];

        h q[0];
        cx q[0], q[1];
        `;

        const prog = parseOpenQasm(qasm, 'bell.qasm');
        assert.strictEqual(prog.qubitsCount, 2);
        assert.strictEqual(prog.clbitsCount, 2);
        assert.strictEqual(prog.instructions.length, 2);

        // Instruction 1: H q[0]
        const hInstr = prog.instructions[0];
        assert.strictEqual(hInstr.type, 'gate');
        assert.strictEqual(hInstr.op, 'h');
        assert.deepStrictEqual(hInstr.qubits, [0]);
        assert.deepStrictEqual(hInstr.params, []);

        // Instruction 2: CX q[0], q[1]
        const cxInstr = prog.instructions[1];
        assert.strictEqual(cxInstr.type, 'gate');
        assert.strictEqual(cxInstr.op, 'cx');
        assert.deepStrictEqual(cxInstr.qubits, [0, 1]);
    });

    test('Parses OpenQASM 3.0 type syntax with rotation angles', () => {
        const qasm = `
        OPENQASM 3.0;
        qubit[3] q;
        bit[3] c;

        h q[0];
        rz(pi / 4) q[0];
        rx(0.5) q[1];
        u(pi/2, 0, pi) q[2];
        reset q[1];
        barrier q[0], q[1];
        measure q[0] -> c[0];
        `;

        const prog = parseOpenQasm(qasm, 'test.qasm');
        assert.strictEqual(prog.qubitsCount, 3);
        assert.strictEqual(prog.clbitsCount, 3);
        assert.strictEqual(prog.instructions.length, 7);

        assert.strictEqual(prog.instructions[0].op, 'h');
        assert.strictEqual(prog.instructions[1].op, 'rz');
        assert.ok(Math.abs(prog.instructions[1].params[0] - Math.PI / 4) < 1e-6);

        assert.strictEqual(prog.instructions[2].op, 'rx');
        assert.strictEqual(prog.instructions[2].params[0], 0.5);

        assert.strictEqual(prog.instructions[3].op, 'u');
        assert.strictEqual(prog.instructions[3].params.length, 3);

        assert.strictEqual(prog.instructions[4].type, 'reset');
        assert.deepStrictEqual(prog.instructions[4].qubits, [1]);

        assert.strictEqual(prog.instructions[5].type, 'barrier');
        assert.deepStrictEqual(prog.instructions[5].qubits, [0, 1]);

        assert.strictEqual(prog.instructions[6].type, 'measure');
        assert.deepStrictEqual(prog.instructions[6].qubits, [0]);
        assert.strictEqual(prog.instructions[6].bit, 0);
    });

    test('getInstructionsUpToLine filters instructions correctly for stepping', () => {
        const qasm = [
            'OPENQASM 2.0;', // line 0
            'qreg q[2];',    // line 1
            'h q[0];',       // line 2
            'x q[1];',       // line 3
            'cx q[0], q[1];' // line 4
        ].join('\n');

        const prog = parseOpenQasm(qasm);
        assert.strictEqual(prog.instructions.length, 3);

        const upToLine2 = prog.getInstructionsUpToLine(2);
        assert.strictEqual(upToLine2.length, 1);
        assert.strictEqual(upToLine2[0].op, 'h');

        const upToLine3 = prog.getInstructionsUpToLine(3);
        assert.strictEqual(upToLine3.length, 2);
        assert.strictEqual(upToLine3[1].op, 'x');

        const upToLine4 = prog.getInstructionsUpToLine(4);
        assert.strictEqual(upToLine4.length, 3);
    });

    test('Serializes OpenQasmProgram back to OpenQASM 2.0 text', () => {
        const prog = new OpenQasmProgram();
        prog.addQreg('q', 2);
        prog.addGate('h', [0]);
        prog.addGate('cx', [0, 1]);

        const serialized = prog.toQasm2String();
        assert.ok(serialized.includes('OPENQASM 2.0;'));
        assert.ok(serialized.includes('qreg q[2];'));
        assert.ok(serialized.includes('h q[0];'));
        assert.ok(serialized.includes('cx q[0], q[1];'));
    });
});

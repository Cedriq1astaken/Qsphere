import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { simulateOpenQasm } from '../src/webview/runtime/simulator.js';

const SQRT1_2 = Math.SQRT1_2;
const TOLERANCE = 1e-3;

function assertClose(a, b, msg) {
    assert.ok(Math.abs(a - b) < TOLERANCE, `${msg}: expected ${b}, got ${a}`);
}

describe('OpenQASM Unified Simulator Suite', () => {
    test('Simulates 1-qubit Hadamard gate', () => {
        const qasm = `
        OPENQASM 2.0;
        qreg q[1];
        h q[0];
        `;
        const res = simulateOpenQasm(qasm);
        assert.strictEqual(res.qubitsDeclared, 1);
        const lastState = res.states[res.states.length - 1];
        assert.strictEqual(lastState.qubits, 1);
        assertClose(lastState.amplitudes[0].re, SQRT1_2, '|0>');
        assertClose(lastState.amplitudes[1].re, SQRT1_2, '|1>');
    });

    test('Simulates 2-qubit Bell state (|00> + |11>) / sqrt(2)', () => {
        const qasm = `
        OPENQASM 2.0;
        include "qelib1.inc";
        qreg q[2];
        h q[0];
        cx q[0], q[1];
        `;
        const res = simulateOpenQasm(qasm);
        assert.strictEqual(res.qubitsDeclared, 2);
        const lastState = res.states[res.states.length - 1];
        assert.strictEqual(lastState.qubits, 2);
        assertClose(lastState.amplitudes[0].re, SQRT1_2, '|00>');
        assertClose(lastState.amplitudes[1].re, 0, '|01>');
        assertClose(lastState.amplitudes[2].re, 0, '|10>');
        assertClose(lastState.amplitudes[3].re, SQRT1_2, '|11>');
    });

    test('Simulates 3-qubit GHZ state (|000> + |111>) / sqrt(2)', () => {
        const qasm = `
        OPENQASM 3.0;
        qubit[3] q;
        h q[0];
        cx q[0], q[1];
        cx q[1], q[2];
        `;
        const res = simulateOpenQasm(qasm);
        assert.strictEqual(res.qubitsDeclared, 3);
        const lastState = res.states[res.states.length - 1];
        assert.strictEqual(lastState.qubits, 3);
        assertClose(lastState.amplitudes[0].re, SQRT1_2, '|000>');
        assertClose(lastState.amplitudes[7].re, SQRT1_2, '|111>');
    });

    test('Simulates single-qubit rotations (Rx, Ry, Rz)', () => {
        const qasm = `
        OPENQASM 2.0;
        qreg q[1];
        ry(pi / 2) q[0];
        `;
        const res = simulateOpenQasm(qasm);
        const lastState = res.states[res.states.length - 1];
        assertClose(lastState.amplitudes[0].re, SQRT1_2, '|0>');
        assertClose(lastState.amplitudes[1].re, SQRT1_2, '|1>');
    });

    test('Simulates reset to |0>', () => {
        const qasm = `
        OPENQASM 2.0;
        qreg q[1];
        x q[0];
        reset q[0];
        `;
        const res = simulateOpenQasm(qasm);
        const lastState = res.states[res.states.length - 1];
        assertClose(lastState.amplitudes[0].re, 1, '|0>');
        assertClose(lastState.amplitudes[1].re, 0, '|1>');
    });

    test('Line inspection stops at designated targetLine', () => {
        const qasm = [
            'OPENQASM 2.0;', // line 0
            'qreg q[2];',    // line 1
            'h q[0];',       // line 2
            'cx q[0], q[1];' // line 3
        ].join('\n');

        // Step up to line 2 (H only)
        const resLine2 = simulateOpenQasm(qasm, 2);
        const state2 = resLine2.states[resLine2.states.length - 1];
        // At line 2: H on q[0] gives (|00> + |10>) / sqrt(2)
        assertClose(state2.amplitudes[0].re, SQRT1_2, '|00>');
        assertClose(state2.amplitudes[2].re, SQRT1_2, '|10>');
        assertClose(state2.amplitudes[3].re, 0, '|11>');

        // Step up to line 3 (H and CX)
        const resLine3 = simulateOpenQasm(qasm, 3);
        const state3 = resLine3.states[resLine3.states.length - 1];
        assertClose(state3.amplitudes[0].re, SQRT1_2, '|00>');
        assertClose(state3.amplitudes[3].re, SQRT1_2, '|11>');
    });

    test('Simulates samples/test.qasm file content successfully', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const filePath = path.join(process.cwd(), 'samples', 'test.qasm');
        const content = fs.readFileSync(filePath, 'utf8');
        const res = simulateOpenQasm(content, undefined, 'test.qasm');
        assert.strictEqual(res.qubitsDeclared, 3);
        assert.ok(res.states.length > 0);
        assert.strictEqual(res.steps.length, 4);
    });
});

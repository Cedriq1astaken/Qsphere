import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    ensureWasm,
    snapshotFromEntries,
    areSnapshotsEqual,
    snapshotSignature,
    formatFailure,
    executeQSharp,
    parseQSharp
} from '../src/webview/runtime/qsharpRuntime.js';

const SQRT1_2 = Math.SQRT1_2;
const TOLERANCE = 1e-3;

function assertAmplitude(amp, expectedRe, expectedIm, label) {
    assert.ok(
        Math.abs(amp.re - expectedRe) < TOLERANCE && Math.abs(amp.im - (expectedIm || 0)) < TOLERANCE,
        `${label || 'amplitude'}: expected (${expectedRe}, ${expectedIm || 0}), got (${amp.re}, ${amp.im})`
    );
}

// Load WebAssembly before running execution tests
before(async () => {
    const wasmPath = path.resolve('assets/wasm/qsc_wasm_bg.wasm');
    const wasmBuf = fs.readFileSync(wasmPath);
    const wasmArrayBuffer = wasmBuf.buffer.slice(wasmBuf.byteOffset, wasmBuf.byteOffset + wasmBuf.byteLength);
    await ensureWasm(wasmArrayBuffer);
});

// ============================================================================
// Suite 1: Snapshot Parsing (snapshotFromEntries)
// ============================================================================
describe('Q# Runtime Snapshot Parsing', () => {
    test('1. Empty entries or non-basis entries return null', () => {
        assert.strictEqual(snapshotFromEntries([]), null);
        assert.strictEqual(snapshotFromEntries([{ name: 'not-a-ket', value: '1.0' }]), null);
        assert.strictEqual(snapshotFromEntries([{ name: '|abc⟩', value: '1.0' }]), null);
    });

    test('2. Single-qubit basis state |0⟩ parsed correctly', () => {
        const entries = [
            { name: '|0⟩', value: '1.0000+0.0000𝑖' }
        ];
        const snapshot = snapshotFromEntries(entries);
        assert.ok(snapshot);
        assert.strictEqual(snapshot.qubits, 1);
        assert.strictEqual(snapshot.amplitudes.length, 2);
        assertAmplitude(snapshot.amplitudes[0], 1, 0, '|0⟩');
        assertAmplitude(snapshot.amplitudes[1], 0, 0, '|1⟩');
    });

    test('3. Single-qubit basis state |1⟩ parsed correctly', () => {
        const entries = [
            { name: '|1⟩', value: '1.0000+0.0000𝑖' }
        ];
        const snapshot = snapshotFromEntries(entries);
        assert.ok(snapshot);
        assert.strictEqual(snapshot.qubits, 1);
        assert.strictEqual(snapshot.amplitudes.length, 2);
        assertAmplitude(snapshot.amplitudes[0], 0, 0, '|0⟩');
        assertAmplitude(snapshot.amplitudes[1], 1, 0, '|1⟩');
    });

    test('4. 1-qubit superposition state (+ state)', () => {
        const entries = [
            { name: '|0⟩', value: '0.7071+0.0000𝑖' },
            { name: '|1⟩', value: '0.7071+0.0000𝑖' }
        ];
        const snapshot = snapshotFromEntries(entries);
        assert.ok(snapshot);
        assert.strictEqual(snapshot.qubits, 1);
        assert.strictEqual(snapshot.amplitudes.length, 2);
        assertAmplitude(snapshot.amplitudes[0], SQRT1_2, 0, '|0⟩');
        assertAmplitude(snapshot.amplitudes[1], SQRT1_2, 0, '|1⟩');
    });

    test('5. 2-qubit Bell state (|00⟩ and |11⟩)', () => {
        const entries = [
            { name: '|00⟩', value: '0.7071+0.0000𝑖' },
            { name: '|11⟩', value: '0.7071+0.0000𝑖' }
        ];
        const snapshot = snapshotFromEntries(entries);
        assert.ok(snapshot);
        assert.strictEqual(snapshot.qubits, 2);
        assert.strictEqual(snapshot.amplitudes.length, 4);
        assertAmplitude(snapshot.amplitudes[0], SQRT1_2, 0, '|00⟩');
        assertAmplitude(snapshot.amplitudes[1], 0, 0, '|01⟩');
        assertAmplitude(snapshot.amplitudes[2], 0, 0, '|10⟩');
        assertAmplitude(snapshot.amplitudes[3], SQRT1_2, 0, '|11⟩');
    });

    test('6. 3-qubit GHZ state (|000⟩ and |111⟩)', () => {
        const entries = [
            { name: '|000⟩', value: '0.7071+0.0000𝑖' },
            { name: '|111⟩', value: '0.7071+0.0000𝑖' }
        ];
        const snapshot = snapshotFromEntries(entries);
        assert.ok(snapshot);
        assert.strictEqual(snapshot.qubits, 3);
        assert.strictEqual(snapshot.amplitudes.length, 8);
        assertAmplitude(snapshot.amplitudes[0], SQRT1_2, 0, '|000⟩');
        assertAmplitude(snapshot.amplitudes[7], SQRT1_2, 0, '|111⟩');
        for (let i = 1; i < 7; i++) {
            assertAmplitude(snapshot.amplitudes[i], 0, 0, `|${i.toString(2).padStart(3, '0')}⟩`);
        }
    });

    test('7. Complex amplitude parsing (real, imaginary, and mixed)', () => {
        const entries = [
            { name: '|0⟩', value: '0.0000+1.0000i' },
            { name: '|1⟩', value: '0.5000-0.5000i' }
        ];
        const snapshot = snapshotFromEntries(entries);
        assert.ok(snapshot);
        assertAmplitude(snapshot.amplitudes[0], 0, 1, '|0⟩');
        assertAmplitude(snapshot.amplitudes[1], 0.5, -0.5, '|1⟩');
    });
});

// ============================================================================
// Suite 2: Snapshot Comparison & Utilities
// ============================================================================
describe('Q# Runtime Snapshot Comparison & Utilities', () => {
    const snap1 = {
        qubits: 1,
        amplitudes: [{ re: 1, im: 0 }, { re: 0, im: 0 }]
    };
    const snap1Clone = {
        qubits: 1,
        amplitudes: [{ re: 1, im: 0 }, { re: 0, im: 0 }]
    };
    const snap1Diff = {
        qubits: 1,
        amplitudes: [{ re: 0, im: 0 }, { re: 1, im: 0 }]
    };
    const snap2 = {
        qubits: 2,
        amplitudes: [{ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }]
    };

    test('1. areSnapshotsEqual handles null/undefined inputs', () => {
        assert.strictEqual(areSnapshotsEqual(null, snap1), false);
        assert.strictEqual(areSnapshotsEqual(snap1, undefined), false);
        assert.strictEqual(areSnapshotsEqual(null, null), false);
    });

    test('2. areSnapshotsEqual detects qubit count mismatch', () => {
        assert.strictEqual(areSnapshotsEqual(snap1, snap2), false);
    });

    test('3. areSnapshotsEqual detects amplitude array length mismatch', () => {
        const corruptSnap = { qubits: 1, amplitudes: [{ re: 1, im: 0 }] };
        assert.strictEqual(areSnapshotsEqual(snap1, corruptSnap), false);
    });

    test('4. areSnapshotsEqual returns true for identical snapshots', () => {
        assert.strictEqual(areSnapshotsEqual(snap1, snap1Clone), true);
    });

    test('5. areSnapshotsEqual detects differing amplitudes', () => {
        assert.strictEqual(areSnapshotsEqual(snap1, snap1Diff), false);
    });

    test('6. areSnapshotsEqual respects tolerance parameter', () => {
        const snapClose = {
            qubits: 1,
            amplitudes: [{ re: 1.0000001, im: 0 }, { re: 0, im: 0 }]
        };
        // Difference is 1e-7, which is > 1e-9 (false) but < 1e-6 (true)
        assert.strictEqual(areSnapshotsEqual(snap1, snapClose, 1e-9), false);
        assert.strictEqual(areSnapshotsEqual(snap1, snapClose, 1e-6), true);
    });

    test('7. snapshotSignature formats deterministic string', () => {
        const sig = snapshotSignature(snap1);
        assert.strictEqual(typeof sig, 'string');
        assert.ok(sig.startsWith('1:'));
        assert.ok(sig.includes('1.00000000000'));
    });

    test('8. formatFailure trims strings and provides fallbacks', () => {
        assert.strictEqual(formatFailure('  Error occurred  \n'), 'Error occurred');
        assert.strictEqual(formatFailure(new Error('Test error')), 'Error: Test error');
        assert.strictEqual(formatFailure(''), '');
        assert.strictEqual(formatFailure(null), 'Unknown Q# execution error.');
        assert.strictEqual(formatFailure(undefined), 'Unknown Q# execution error.');
    });
});

// ============================================================================
// Suite 3: Q# Program Execution & Compilation (executeQSharp)
// ============================================================================
describe('Q# Program Execution & Compilation', () => {
    test('1. Invalid Q# syntax returns error diagnostics', async () => {
        const code = 'invalid syntax not valid q# code';
        const result = await executeQSharp(code);
        assert.ok(result.error, 'Should return compilation error');
        assert.strictEqual(result.states.length, 0, 'No states should be produced on syntax error');
    });

    test('2. Single-qubit Pauli-X gate flips |0⟩ to |1⟩', async () => {
        const code = `
        operation Main() : Unit {
            use q = Qubit();
            X(q);
            Reset(q);
        }
        `;
        const result = await executeQSharp(code);
        assert.strictEqual(result.error, undefined);
        assert.strictEqual(result.qubitsDeclared, 1);
        assert.deepStrictEqual(result.qubitsList, ['q0']);
        assert.ok(result.states.length > 0, 'Should capture quantum states');

        const finalState = result.states[result.states.length - 1];
        assert.strictEqual(finalState.qubits, 1);
        assertAmplitude(finalState.amplitudes[0], 0, 0, '|0⟩');
        assertAmplitude(finalState.amplitudes[1], 1, 0, '|1⟩');
    });

    test('3. Single-qubit Hadamard gate creates equal superposition', async () => {
        const code = `
        operation Main() : Unit {
            use q = Qubit();
            H(q);
            Reset(q);
        }
        `;
        const result = await executeQSharp(code);
        assert.strictEqual(result.error, undefined);
        assert.strictEqual(result.qubitsDeclared, 1);
        assert.deepStrictEqual(result.qubitsList, ['q0']);

        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[0], SQRT1_2, 0, '|0⟩');
        assertAmplitude(finalState.amplitudes[1], SQRT1_2, 0, '|1⟩');
    });

    test('4. Two-qubit Bell state circuit creates (|00⟩ + |11⟩)/√2', async () => {
        const code = `
        operation Main() : Unit {
            use q = Qubit[2];
            H(q[0]);
            CNOT(q[0], q[1]);
            ResetAll(q);
        }
        `;
        const result = await executeQSharp(code);
        assert.strictEqual(result.error, undefined);
        assert.strictEqual(result.qubitsDeclared, 2);
        assert.deepStrictEqual(result.qubitsList, ['q0', 'q1']);
        assert.ok(result.states.length >= 2, 'Should capture intermediate and final states');

        const finalState = result.states[result.states.length - 1];
        assert.strictEqual(finalState.qubits, 2);
        assert.strictEqual(finalState.amplitudes.length, 4);
        assertAmplitude(finalState.amplitudes[0], SQRT1_2, 0, '|00⟩');
        assertAmplitude(finalState.amplitudes[1], 0, 0, '|01⟩');
        assertAmplitude(finalState.amplitudes[2], 0, 0, '|10⟩');
        assertAmplitude(finalState.amplitudes[3], SQRT1_2, 0, '|11⟩');
    });

    test('5. Three-qubit GHZ state circuit creates (|000⟩ + |111⟩)/√2', async () => {
        const code = `
        operation Main() : Unit {
            use q = Qubit[3];
            H(q[0]);
            CNOT(q[0], q[1]);
            CNOT(q[1], q[2]);
            ResetAll(q);
        }
        `;
        const result = await executeQSharp(code);
        assert.strictEqual(result.error, undefined);
        assert.strictEqual(result.qubitsDeclared, 3);
        assert.deepStrictEqual(result.qubitsList, ['q0', 'q1', 'q2']);

        const finalState = result.states[result.states.length - 1];
        assert.strictEqual(finalState.qubits, 3);
        assert.strictEqual(finalState.amplitudes.length, 8);
        assertAmplitude(finalState.amplitudes[0], SQRT1_2, 0, '|000⟩');
        assertAmplitude(finalState.amplitudes[7], SQRT1_2, 0, '|111⟩');
        for (let i = 1; i < 7; i++) {
            assertAmplitude(finalState.amplitudes[i], 0, 0, `basis state ${i}`);
        }
    });

    test('6. Reset filtering preserves quantum state before deallocation', async () => {
        const code = `
        operation Main() : Unit {
            use q = Qubit();
            X(q);
            Reset(q);
        }
        `;
        const result = await executeQSharp(code);
        const finalState = result.states[result.states.length - 1];
        // Must preserve the X-gate result (|1⟩) rather than the reset state (|0⟩)
        assertAmplitude(finalState.amplitudes[1], 1, 0, 'Final state before Reset is preserved');
    });
});

// ============================================================================
// Suite 4: Stepping, Scoping, and Safety Limits
// ============================================================================
describe('Q# Stepping, Scoping, and Safety Limits', () => {
    test('1. targetLine inspects state up to designated line before subsequent gates', async () => {
        const code = [
            'operation Main() : Unit {',      // Line 0
            '    use q = Qubit[2];',           // Line 1
            '    H(q[0]);',                    // Line 2
            '    CNOT(q[0], q[1]);',           // Line 3
            '    ResetAll(q);',                // Line 4
            '}'                                // Line 5
        ].join('\n');

        // Stopping at line 2 (after H, before CNOT)
        const result = await executeQSharp(code, 'main.qs', undefined, undefined, 2);
        assert.strictEqual(result.error, undefined);
        assert.ok(result.states.length > 0);

        const inspectedState = result.states[result.states.length - 1];
        // After H(q[0]) on |00⟩, state is (|00⟩ + |10⟩)/√2 (amplitude 0 and amplitude 2)
        assertAmplitude(inspectedState.amplitudes[0], SQRT1_2, 0, '|00⟩');
        assertAmplitude(inspectedState.amplitudes[1], 0, 0, '|01⟩');
        assertAmplitude(inspectedState.amplitudes[2], SQRT1_2, 0, '|10⟩');
        assertAmplitude(inspectedState.amplitudes[3], 0, 0, '|11⟩');
    });

    test('2. targetOp filters execution to specified operation', async () => {
        const code = `
        operation Helper(q : Qubit) : Unit {
            X(q);
        }

        operation Main() : Unit {
            use q = Qubit();
            H(q);
            Helper(q);
            Reset(q);
        }
        `;
        const result = await executeQSharp(code, 'main.qs', undefined, { name: 'Main', startLine: 5, endLine: 11 });
        assert.strictEqual(result.error, undefined);
        assert.strictEqual(result.qubitsDeclared, 1);
        assert.ok(result.states.length > 0);
    });

    test('3. Steps array captures debug breakpoint execution steps', async () => {
        const code = `
        operation Main() : Unit {
            use q = Qubit();
            H(q);
            Reset(q);
        }
        `;
        const result = await executeQSharp(code);
        assert.ok(Array.isArray(result.steps));
        assert.ok(result.steps.length > 0);
        assert.ok('resultId' in result.steps[0]);
    });

    test('4. parseQSharp executes safely without throwing ReferenceError', async () => {
        const code = `
        operation Main() : Unit {
            use q = Qubit();
            H(q);
            Reset(q);
        }
        `;
        const result = await parseQSharp(code);
        assert.strictEqual(result.error, undefined);
        assert.strictEqual(result.qubitsDeclared, 1);
    });
});

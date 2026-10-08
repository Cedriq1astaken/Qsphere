import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from '../src/webview/runtime/qiskitRuntime.js';

const TOLERANCE = 1e-9;
const SQRT2_INV = 1 / Math.sqrt(2);

function assertAmplitude(amp, expectedRe, expectedIm, label) {
    assert.ok(
        Math.abs(amp.re - expectedRe) < TOLERANCE && Math.abs(amp.im - (expectedIm || 0)) < TOLERANCE,
        `${label || 'amplitude'}: expected (${expectedRe}, ${expectedIm || 0}), got (${amp.re}, ${amp.im})`
    );
}

function assertState(result, expectedAmplitudes, label) {
    const state = result.states[result.states.length - 1];
    assert.ok(state, `${label || 'state'}: no states produced`);
    assert.strictEqual(state.amplitudes.length, expectedAmplitudes.length,
        `${label || 'state'}: amplitude count mismatch`);
    for (let i = 0; i < expectedAmplitudes.length; i++) {
        const [re, im] = expectedAmplitudes[i];
        assertAmplitude(state.amplitudes[i], re, im || 0, `${label || 'state'}[${i}]`);
    }
}

// ============================================================================
// Suite 1: Validation & Circuit Detection
// ============================================================================
describe('Qiskit Validation & Circuit Detection', () => {
    test('1. Missing Qiskit import returns error', () => {
        const result = parseQiskit('x = 42\nprint(x)\n');
        assert.ok(result.error);
        assert.match(result.error, /No Qiskit import/i);
        assert.strictEqual(result.states.length, 0);
    });

    test('2. Missing QuantumCircuit returns error', () => {
        const result = parseQiskit('from qiskit import QuantumCircuit\nx = 42\n');
        assert.ok(result.error);
        assert.match(result.error, /No QuantumCircuit/i);
    });

    test('3a. Detects "import qiskit" style', () => {
        assert.ok(hasQiskitImport('import qiskit\n'));
    });

    test('3b. Detects "from qiskit import QuantumCircuit" style', () => {
        assert.ok(hasQiskitImport('from qiskit import QuantumCircuit\n'));
    });

    test('3c. Detects "from qiskit import *" style', () => {
        assert.ok(hasQiskitImport('from qiskit import *\n'));
    });

    test('3d. Detects "from qiskit.circuit import QuantumCircuit as QC" style', () => {
        const source = `from qiskit.circuit import QuantumCircuit as QC\ncirc = QC(2)\ncirc.h(0)\n`;
        assert.ok(hasQiskitImport(source));
        const circuit = findCircuitInit(source);
        assert.ok(circuit);
        assert.strictEqual(circuit.name, 'circ');
        assert.strictEqual(circuit.qubits, 2);
    });

    test('4. Correctly identifies circuit variable name and qubit count', () => {
        const source = `from qiskit import QuantumCircuit\nmy_circuit = QuantumCircuit(5)\nmy_circuit.h(0)\n`;
        const circuit = findCircuitInit(source);
        assert.ok(circuit);
        assert.strictEqual(circuit.name, 'my_circuit');
        assert.strictEqual(circuit.qubits, 5);
        assert.strictEqual(circuit.startLine, 1);
    });

    test('4b. Fresh circuit initialization QuantumCircuit(2, 2) initializes to |00⟩', () => {
        const source = `from qiskit import QuantumCircuit\n\nqc = QuantumCircuit(2, 2)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.qubitsDeclared, 2);
        assert.deepStrictEqual(result.qubitsList, ['q0', 'q1']);
        assert.strictEqual(result.states.length, 1);
        assertState(result, [[1, 0], [0, 0], [0, 0], [0, 0]], '|00⟩ ground state');
    });
});

// ============================================================================
// Suite 2: Single-Qubit Standard & Parametric Gates
// ============================================================================
describe('Qiskit Single-Qubit Gates', () => {
    test('5. Hadamard (H) creates equal superposition', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.h(0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error, result.error);
        assertState(result, [[SQRT2_INV, 0], [SQRT2_INV, 0]], 'H|0⟩');
    });

    test('6a. Pauli-X flips |0⟩ to |1⟩', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.x(0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[0, 0], [1, 0]], 'X|0⟩');
    });

    test('6b. Pauli-Y on |0⟩ gives i|1⟩', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.y(0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[0, 0], [0, 1]], 'Y|0⟩');
    });

    test('6c. Pauli-Z on |0⟩ keeps |0⟩, on |1⟩ gives -|1⟩', () => {
        // Z|0⟩ = |0⟩ (trivial, no state change), so test Z on |1⟩
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.x(0)\nqc.z(0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[0, 0], [-1, 0]], 'Z|1⟩');
    });

    test('7a. H then S gives |+i⟩ = (|0⟩ + i|1⟩)/√2', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.h(0)\nqc.s(0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[SQRT2_INV, 0], [0, SQRT2_INV]], 'S·H|0⟩');
    });

    test('7b. H then T gives (|0⟩ + e^(iπ/4)|1⟩)/√2', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.h(0)\nqc.t(0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        const state = result.states[result.states.length - 1];
        assertAmplitude(state.amplitudes[0], SQRT2_INV, 0, '|0⟩ component');
        assertAmplitude(state.amplitudes[1],
            SQRT2_INV * Math.cos(Math.PI / 4),
            SQRT2_INV * Math.sin(Math.PI / 4),
            '|1⟩ component');
    });

    test('7c. H then P(pi/2) gives (|0⟩ + i|1⟩)/√2', () => {
        const source = `from qiskit import QuantumCircuit\nimport numpy as np\nqc = QuantumCircuit(1)\nqc.h(0)\nqc.p(np.pi / 2, 0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[SQRT2_INV, 0], [0, SQRT2_INV]], 'P(π/2)·H|0⟩');
    });

    test('8. SX gate on |0⟩', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.sx(0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[0.5, 0.5], [0.5, -0.5]], 'SX|0⟩');
    });

    test('9a. RX(π) on |0⟩ gives -i|1⟩', () => {
        const source = `from qiskit import QuantumCircuit\nimport numpy as np\nqc = QuantumCircuit(1)\nqc.rx(np.pi, 0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[0, 0], [0, -1]], 'RX(π)|0⟩');
    });

    test('9b. RY(π) on |0⟩ gives |1⟩', () => {
        const source = `from qiskit import QuantumCircuit\nimport numpy as np\nqc = QuantumCircuit(1)\nqc.ry(np.pi, 0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[0, 0], [1, 0]], 'RY(π)|0⟩');
    });

    test('10. U(π/2, 0, π) on |0⟩ (equivalent to H)', () => {
        const source = `from qiskit import QuantumCircuit\nimport numpy as np\nqc = QuantumCircuit(1)\nqc.u(np.pi / 2, 0, np.pi, 0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[SQRT2_INV, 0], [SQRT2_INV, 0]], 'U(π/2,0,π)|0⟩');
    });
});

// ============================================================================
// Suite 3: Multi-Qubit Entanglement & Controlled Gates
// ============================================================================
describe('Qiskit Multi-Qubit & Controlled Gates', () => {
    test('11. Bell state |Φ+⟩ = H then CX', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(2)\nqc.h(0)\nqc.cx(0, 1)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[SQRT2_INV, 0], [0, 0], [0, 0], [SQRT2_INV, 0]], '|Φ+⟩');
    });

    test('12. Bell state |Ψ+⟩ = X(1) then H(0) then CX(0,1)', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(2)\nqc.x(1)\nqc.h(0)\nqc.cx(0, 1)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        // |Ψ+⟩ = (|01⟩ + |10⟩)/√2
        assertState(result, [[0, 0], [SQRT2_INV, 0], [SQRT2_INV, 0], [0, 0]], '|Ψ+⟩');
    });

    test('13. GHZ state on 3 qubits', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(3)\nqc.h(0)\nqc.cx(0, 1)\nqc.cx(1, 2)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        const state = result.states[result.states.length - 1];
        assertAmplitude(state.amplitudes[0], SQRT2_INV, 0, '|000⟩');
        assertAmplitude(state.amplitudes[7], SQRT2_INV, 0, '|111⟩');
        // All others should be 0
        for (const i of [1, 2, 3, 4, 5, 6]) {
            assertAmplitude(state.amplitudes[i], 0, 0, `|${i.toString(2).padStart(3, '0')}⟩`);
        }
    });

    test('14. CZ on H|0⟩⊗H|0⟩ gives (|00⟩+|01⟩+|10⟩-|11⟩)/2', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(2)\nqc.h(0)\nqc.h(1)\nqc.cz(0, 1)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[0.5, 0], [0.5, 0], [0.5, 0], [-0.5, 0]], 'CZ|++⟩');
    });

    test('15. SWAP exchanges qubit states', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(2)\nqc.x(0)\nqc.swap(0, 1)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        // |10⟩ → |01⟩ (index 2 → index 1)
        assertState(result, [[0, 0], [1, 0], [0, 0], [0, 0]], 'SWAP|10⟩');
    });

    test('16a. Toffoli (CCX) gate', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(3)\nqc.x(0)\nqc.x(1)\nqc.ccx(0, 1, 2)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        // |110⟩ → |111⟩ (index 6 → index 7)
        assertState(result, [
            [0, 0], [0, 0], [0, 0], [0, 0],
            [0, 0], [0, 0], [0, 0], [1, 0]
        ], 'CCX|110⟩');
    });

    test('16b. Fredkin (CSWAP) gate', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(3)\nqc.x(0)\nqc.x(1)\nqc.cswap(0, 1, 2)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        // |110⟩ → |101⟩ (control q0=1, swap q1 and q2: index 6 → index 5)
        assertState(result, [
            [0, 0], [0, 0], [0, 0], [0, 0],
            [0, 0], [1, 0], [0, 0], [0, 0]
        ], 'CSWAP|110⟩');
    });

    test('17. Multi-Controlled X (MCX)', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(4)\nqc.x(0)\nqc.x(1)\nqc.x(2)\nqc.mcx([0, 1, 2], 3)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        // |1110⟩ → |1111⟩ (all controls set → flip target: index 14 → index 15)
        const state = result.states[result.states.length - 1];
        assertAmplitude(state.amplitudes[15], 1, 0, '|1111⟩');
    });
});

// ============================================================================
// Suite 4: State Reset, Initialization, & Line Inspection
// ============================================================================
describe('Qiskit State Reset, Initialization, & Line Inspection', () => {
    test('18. Reset returns qubit to |0⟩', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.x(0)\nqc.reset(0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[1, 0], [0, 0]], 'reset after X');
    });

    test('19. Initialize sets arbitrary state', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.initialize([0, 1], 0)\n`;
        const result = parseQiskit(source);
        assert.ok(!result.error);
        assertState(result, [[0, 0], [1, 0]], 'initialize |1⟩');
    });

    test('20. Line inspection (targetLine) stops simulation at specified line', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',       // line 1
            'qc.h(0)',                       // line 2
            'qc.cx(0, 1)',                   // line 3
        ].join('\n');

        // Inspect up to line 2 (H gate only on q0, before CX)
        const result = parseQiskit(source, 2);
        assert.ok(!result.error);
        // After H on qubit 0 (MSB): (|00⟩ + |10⟩)/√2
        const state = result.states[result.states.length - 1];
        assertAmplitude(state.amplitudes[0], SQRT2_INV, 0, '|00⟩ after H(0)');
        assertAmplitude(state.amplitudes[1], 0, 0, '|01⟩');
        assertAmplitude(state.amplitudes[2], SQRT2_INV, 0, '|10⟩ after H(0)');
        assertAmplitude(state.amplitudes[3], 0, 0, '|11⟩');
    });

    test('21. findCircuitInit returns correct line for CodeLens placement', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'import numpy as np',
            '',
            'qc = QuantumCircuit(3)',  // line 3
            'qc.h(0)',
            'qc.cx(0, 1)',
        ].join('\n');

        const circuit = findCircuitInit(source);
        assert.ok(circuit);
        assert.strictEqual(circuit.startLine, 3, 'CodeLens should be on QuantumCircuit init line');
        assert.strictEqual(circuit.name, 'qc');
        assert.strictEqual(circuit.qubits, 3);
    });
});

// ============================================================================
// Python expression evaluator tests
// ============================================================================
describe('Qiskit Python Expression Evaluator', () => {
    test('Evaluates np.pi correctly', () => {
        const val = evalPythonExpr('np.pi');
        assert.ok(Math.abs(val - Math.PI) < TOLERANCE);
    });

    test('Evaluates math.pi / 2 correctly', () => {
        const val = evalPythonExpr('math.pi / 2');
        assert.ok(Math.abs(val - Math.PI / 2) < TOLERANCE);
    });

    test('Evaluates 3 * pi / 4 correctly', () => {
        const val = evalPythonExpr('3 * pi / 4');
        assert.ok(Math.abs(val - 3 * Math.PI / 4) < TOLERANCE);
    });

    test('Evaluates float literal correctly', () => {
        const val = evalPythonExpr('0.5');
        assert.ok(Math.abs(val - 0.5) < TOLERANCE);
    });

    test('Evaluates -pi correctly', () => {
        const val = evalPythonExpr('-pi');
        assert.ok(Math.abs(val - (-Math.PI)) < TOLERANCE);
    });
});

// ============================================================================
// Output schema compatibility
// ============================================================================
describe('Qiskit Output Schema Compatibility', () => {
    test('Output matches Q# schema shape', () => {
        const source = `from qiskit import QuantumCircuit\nqc = QuantumCircuit(2)\nqc.h(0)\nqc.cx(0, 1)\n`;
        const result = parseQiskit(source);

        // Required top-level fields
        assert.ok('qubitsDeclared' in result);
        assert.ok('qubitsList' in result);
        assert.ok('states' in result);
        assert.ok('steps' in result);
        assert.strictEqual(result.qubitsDeclared, 2);
        assert.deepStrictEqual(result.qubitsList, ['q0', 'q1']);
        assert.ok(Array.isArray(result.states));
        assert.ok(result.states.length > 0);

        // State shape
        const state = result.states[0];
        assert.ok('qubits' in state);
        assert.ok('amplitudes' in state);
        assert.ok(Array.isArray(state.amplitudes));
        assert.strictEqual(state.amplitudes.length, 4); // 2^2

        // Amplitude shape
        const amp = state.amplitudes[0];
        assert.ok('re' in amp);
        assert.ok('im' in amp);
    });
});

describe('Qiskit Iterable Evaluator', () => {
    test('evalIterable evaluates range(stop)', () => {
        const result = evalIterable('range(3)');
        assert.deepStrictEqual(result, [0, 1, 2]);
    });

    test('evalIterable evaluates range(start, stop)', () => {
        const result = evalIterable('range(1, 4)');
        assert.deepStrictEqual(result, [1, 2, 3]);
    });

    test('evalIterable evaluates range(start, stop, step)', () => {
        const result = evalIterable('range(0, 6, 2)');
        assert.deepStrictEqual(result, [0, 2, 4]);
    });

    test('evalIterable evaluates reversed range', () => {
        const result = evalIterable('reversed(range(3))');
        assert.deepStrictEqual(result, [2, 1, 0]);
    });

    test('evalIterable evaluates range with scoped variables', () => {
        const scope = { n: 4, start: 1 };
        const result = evalIterable('range(start, n)', scope);
        assert.deepStrictEqual(result, [1, 2, 3]);
    });

    test('evalIterable evaluates list literals and scope arrays', () => {
        const result1 = evalIterable('[0, 2, 4]');
        assert.deepStrictEqual(result1, [0, 2, 4]);

        const scope = { qubits: [1, 3] };
        const result2 = evalIterable('qubits', scope);
        assert.deepStrictEqual(result2, [1, 3]);
    });

    test('evalIterable evaluates enumerate', () => {
        const result = evalIterable('enumerate([10, 20])');
        assert.deepStrictEqual(result, [[0, 10], [1, 20]]);
    });
});

describe('Qiskit Loop Support', () => {
    test('Loop 1: for i in range(3): qc.h(i) creates 3-qubit equal superposition', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(3)',
            'for i in range(3):',
            '    qc.h(i)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error, `Unexpected error: ${result.error}`);
        assert.strictEqual(result.qubitsDeclared, 3);
        assert.strictEqual(result.steps.length, 3);
        assert.strictEqual(result.states.length, 3);

        const expectedAmp = 1 / Math.sqrt(8);
        const finalState = result.states[result.states.length - 1];
        for (let i = 0; i < 8; i++) {
            assertAmplitude(finalState.amplitudes[i], expectedAmp, 0, `|${i}⟩`);
        }
    });

    test('Loop 2: range with step flips specific qubits', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(4)',
            'for i in range(0, 4, 2):',
            '    qc.x(i)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 2);
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[10], 1, 0, '|1010⟩ state');
    });

    test('Loop 3: 2-qubit entangling chain creates GHZ state', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(3)',
            'qc.h(0)',
            'for i in range(2):',
            '    qc.cx(i, i + 1)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 3);
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[0], SQRT2_INV, 0, '|000⟩');
        assertAmplitude(finalState.amplitudes[7], SQRT2_INV, 0, '|111⟩');
    });

    test('Loop 4: tuple unpacking in loop [(0, 1), (1, 2)]', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(3)',
            'qc.h(0)',
            'for c, t in [(0, 1), (1, 2)]:',
            '    qc.cx(c, t)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 3);
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[0], SQRT2_INV, 0, '|000⟩');
        assertAmplitude(finalState.amplitudes[7], SQRT2_INV, 0, '|111⟩');
    });

    test('Loop 5: list iteration for q in [0, 2]: qc.x(q)', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(3)',
            'for q in [0, 2]:',
            '    qc.x(q)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 2);
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[5], 1, 0, '|101⟩ state');
    });

    test('Loop 6: nested loop - 3-qubit QFT circuit', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'import numpy as np',
            'qc = QuantumCircuit(3)',
            'for j in range(3):',
            '    qc.h(j)',
            '    for k in range(j + 1, 3):',
            '        qc.cp(np.pi / (2 ** (k - j)), k, j)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        // j=0: h(0), cp(1,0), cp(2,0) [3 steps]
        // j=1: h(1), cp(2,1)          [2 steps]
        // j=2: h(2)                   [1 step]
        assert.strictEqual(result.steps.length, 6);
    });

    test('Loop 7: single-line loop syntax for i in range(2): qc.x(i)', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            'for i in range(2): qc.x(i)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 2);
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[3], 1, 0, '|11⟩ state');
    });

    test('Loop 8: loop with if condition inside', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(4)',
            'for i in range(4):',
            '    if i % 2 == 1:',
            '        qc.x(i)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 2);
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[5], 1, 0, '|0101⟩ state');
    });

    test('Loop 9: circuit initialized with variable and variable in range', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'n = 3',
            'qc = QuantumCircuit(n)',
            'for i in range(n):',
            '    qc.h(i)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.qubitsDeclared, 3);
        assert.strictEqual(result.steps.length, 3);
    });

    test('Loop 10: line inspection (targetLine) before, inside, and after loop', () => {
        const source = [
            'from qiskit import QuantumCircuit', // Line 0
            'qc = QuantumCircuit(3)',            // Line 1
            'qc.h(0)',                           // Line 2
            'for i in range(1, 3):',             // Line 3
            '    qc.cx(0, i)',                   // Line 4
            'qc.x(0)'                            // Line 5
        ].join('\n');

        // Target line 2: only qc.h(0)
        const resLine2 = parseQiskit(source, 2);
        assert.strictEqual(resLine2.steps.length, 1);
        assert.strictEqual(resLine2.steps[0].gate, 'h');

        // Target line 4: qc.h(0) and both cx iterations
        const resLine4 = parseQiskit(source, 4);
        assert.strictEqual(resLine4.steps.length, 3);
        assert.strictEqual(resLine4.steps[1].gate, 'cx');
        assert.strictEqual(resLine4.steps[2].gate, 'cx');

        // Target line 5: all gates including qc.x(0)
        const resLine5 = parseQiskit(source, 5);
        assert.strictEqual(resLine5.steps.length, 4);
        assert.strictEqual(resLine5.steps[3].gate, 'x');
    });

    test('Loop 11: safety limit halts runaway loop', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(1)',
            'for i in range(20000):',
            '    qc.x(0)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(result.error && result.error.includes('10,000-step'));
        assert.strictEqual(result.steps.length, 10000);
    });

    test('Loop 12: barrier and measurement inside loop do not error', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            'for i in range(2):',
            '    qc.h(i)',
            '    qc.barrier(i)',
            '    qc.measure(i, i)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 6);
    });
});

describe('Qiskit Function Support', () => {
    test('Function 1: Defining a function without calling it does NOT execute its body', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            '',
            'def uncalled_helper(qc):',
            '    qc.x(0)',
            '    qc.x(1)',
            ''
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error, `Unexpected error: ${result.error}`);
        assert.strictEqual(result.steps.length, 0);
        // Ground state |00⟩
        assert.strictEqual(result.states.length, 1);
        assertAmplitude(result.states[0].amplitudes[0], 1, 0, '|00⟩');
    });

    test('Function 2: Calling function with circuit passed executes its body', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            '',
            'def bell_pair(qc):',
            '    qc.h(0)',
            '    qc.cx(0, 1)',
            '',
            'bell_pair(qc)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 2);
        assert.strictEqual(result.steps[0].gate, 'h');
        assert.strictEqual(result.steps[1].gate, 'cx');

        // Bell state (|00⟩ + |11⟩)/√2
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[0], SQRT2_INV, 0, '|00⟩');
        assertAmplitude(finalState.amplitudes[3], SQRT2_INV, 0, '|11⟩');
    });

    test('Function 3: Loops inside function execute when function is called', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'n = 3',
            'qc = QuantumCircuit(n)',
            '',
            'def create_superposition(qc, n):',
            '    for i in range(n):',
            '        qc.h(i)',
            '',
            'create_superposition(qc, n)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.qubitsDeclared, 3);
        assert.strictEqual(result.steps.length, 3);

        const expectedAmp = 1 / Math.sqrt(8);
        const finalState = result.states[result.states.length - 1];
        for (let i = 0; i < 8; i++) {
            assertAmplitude(finalState.amplitudes[i], expectedAmp, 0, `|${i}⟩`);
        }
    });

    test('Function 4: Aliased circuit parameter name (def prep(circ): circ.h(0))', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            '',
            'def prep(circ):',
            '    circ.h(0)',
            '    circ.cx(0, 1)',
            '',
            'prep(qc)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 2);

        // Bell state (|00⟩ + |11⟩)/√2
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[0], SQRT2_INV, 0, '|00⟩');
        assertAmplitude(finalState.amplitudes[3], SQRT2_INV, 0, '|11⟩');
    });

    test('Function 5: Function defined before QuantumCircuit initialization', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            '',
            'def add_gates(qc):',
            '    qc.x(0)',
            '    qc.x(1)',
            '',
            'n = 2',
            'qc = QuantumCircuit(n)',
            'add_gates(qc)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 2);
        const finalState = result.states[result.states.length - 1];
        assertAmplitude(finalState.amplitudes[3], 1, 0, '|11⟩ state');
    });

    test('Function 6: Multiple calls to helper function', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(4)',
            '',
            'def make_bell(qc, a, b):',
            '    qc.h(a)',
            '    qc.cx(a, b)',
            '',
            'make_bell(qc, 0, 1)',
            'make_bell(qc, 2, 3)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 4);
    });

    test('Function 7: Function with return statement stops early', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            '',
            'def early_ret(qc):',
            '    qc.x(0)',
            '    return',
            '    qc.x(1)',
            '',
            'early_ret(qc)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 1);
        assert.strictEqual(result.steps[0].gate, 'x');
    });

    test('Function 8: Type annotated function def (qc: QuantumCircuit, n: int) -> None', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            '',
            'def typed_fn(qc: QuantumCircuit, target: int = 0) -> None:',
            '    qc.h(target)',
            '',
            'typed_fn(qc, 0)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error);
        assert.strictEqual(result.steps.length, 1);
        assert.strictEqual(result.steps[0].gate, 'h');
    });

    test('Function 9: W-state loop with math.acos, math.sqrt, and 3-arg ry (controlled-ry)', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'import math',
            'n = 3',
            'qc = QuantumCircuit(n, n)',
            '',
            'def w_state(qc, n):',
            '    qc.x(0)',
            '    for i in range(1, n):',
            '        angle = math.acos(math.sqrt((n - i)/ n))',
            '        qc.ry(angle, 0, i)',
            '        qc.cx(i, 0)',
            '',
            'w_state(qc, n)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error, `Unexpected error: ${result.error}`);
        assert.strictEqual(result.qubitsDeclared, 3);
        // x(0), ry(0,1), cx(1,0), ry(0,2), cx(2,0) => 5 steps!
        assert.strictEqual(result.steps.length, 5);
        assert.strictEqual(result.steps[0].gate, 'x');
        assert.strictEqual(result.steps[1].gate, 'ry');
        assert.strictEqual(result.steps[2].gate, 'cx');
        assert.strictEqual(result.steps[3].gate, 'ry');
        assert.strictEqual(result.steps[4].gate, 'cx');

        // States should evolve at each step
        assert.ok(result.states.length > 1);
    });

    test('evalPythonExpr handles nested math functions and acos', () => {
        const val1 = evalPythonExpr('math.acos(math.sqrt((3 - 1) / 3))');
        assert.ok(!isNaN(val1));
        assert.ok(Math.abs(val1 - Math.acos(Math.sqrt(2 / 3))) < 1e-9);

        const val2 = evalPythonExpr('np.arccos(np.sqrt((n - i) / n))', { n: 3, i: 1 });
        assert.ok(!isNaN(val2));
        assert.ok(Math.abs(val2 - Math.acos(Math.sqrt(2 / 3))) < 1e-9);
    });
});

describe('Qiskit Lezer AST Parser Capabilities', () => {
    test('1. Semicolon-separated statements on a single line', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            'qc.h(0); qc.x(1)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error, `Unexpected error: ${result.error}`);
        assert.strictEqual(result.steps.length, 2);
        assert.strictEqual(result.steps[0].gate, 'h');
        assert.strictEqual(result.steps[1].gate, 'x');
    });

    test('2. Tolerates half-typed / incomplete lines without throwing error', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            'qc.h(0)',
            'qc.x('  // Incomplete code typed by user
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error, `Unexpected error: ${result.error}`);
        // qc.h(0) should execute normally even though line 3 is half-typed!
        assert.strictEqual(result.steps.length, 1);
        assert.strictEqual(result.steps[0].gate, 'h');
    });

    test('3. Keyword argument order in helper function call', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            'def apply_gates(circuit, target):',
            '    circuit.x(target)',
            'apply_gates(target=1, circuit=qc)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error, `Unexpected error: ${result.error}`);
        assert.strictEqual(result.steps.length, 1);
        assert.strictEqual(result.steps[0].gate, 'x');
    });

    test('4. Interleaved comments inside functions and loops', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(3)',
            'def setup(qc):',
            '    # First step: superposition',
            '    qc.h(0)',
            '    # Loop over targets',
            '    for i in range(1, 3):',
            '        # Entangle with root',
            '        qc.cx(0, i)',
            'setup(qc)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error, `Unexpected error: ${result.error}`);
        assert.strictEqual(result.steps.length, 3);
        assert.strictEqual(result.steps[0].gate, 'h');
        assert.strictEqual(result.steps[1].gate, 'cx');
        assert.strictEqual(result.steps[2].gate, 'cx');
    });

    test('5. User test.py script with w_state and ghz_state functions', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'import math',
            '',
            'n = 3',
            'qc = QuantumCircuit(n, n)',
            '',
            'def w_state(qc, n):',
            '    qc.x(0)',
            '    for i in range(1, n):',
            '        angle = math.acos(math.sqrt(1 / (n - i + 1)))',
            '        qc.cry(2.0 * angle, i - 1, i)',
            '        qc.cx(i, i - 1)',
            '',
            'def ghz_state(qc, n):',
            '    qc.h(0)',
            '    for i in range(1, n):',
            '        qc.cx(0, i)',
            '',
            'ghz_state(qc, n)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(!result.error, `Unexpected error: ${result.error}`);
        assert.strictEqual(result.qubitsDeclared, 3);
        // ghz_state runs: h(0), cx(0, 1), cx(0, 2)
        assert.strictEqual(result.steps.length, 3);
        assert.strictEqual(result.steps[0].gate, 'h');
        assert.strictEqual(result.steps[1].gate, 'cx');
        assert.strictEqual(result.steps[2].gate, 'cx');
        // w_state was NOT called so its gates did not run
        assert.ok(result.steps.every(s => s.gate !== 'cry'));
    });

    test('6. parseQiskit emits OpenQASM 2.0 representation', () => {
        const source = [
            'from qiskit import QuantumCircuit',
            'qc = QuantumCircuit(2)',
            'qc.h(0)',
            'qc.cx(0, 1)'
        ].join('\n');

        const result = parseQiskit(source);
        assert.ok(result.qasm);
        assert.ok(result.qasm.includes('OPENQASM 2.0;'));
        assert.ok(result.qasm.includes('h q[0];'));
        assert.ok(result.qasm.includes('cx q[0], q[1];'));
        assert.strictEqual(result.qasmProgram.instructions.length, 2);
    });
});


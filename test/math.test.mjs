import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
    Complex,
    complexAbs2,
    vec3Normalize,
    vec3Cross,
    vec3Dot,
    vectorsClose,
    rodriguesRotate,
    alignmentRotation,
    interpolateVector,
    distanceToSegment,
    projectPoint,
    mult,
    createPerspectiveMatrix,
    createTranslationMatrix,
    extractQubitBloch,
    hammingWeight,
    computeQspherePoints,
    getPhaseToRgb,
    formatBasisState,
    formatPhasePi,
    parseAmplitude,
    isTrivialState,
    stepStatevectorTransition,
    formatQuantumStateKaTeX,
    stateToKaTeX
} from '../src/webview/math/index.js';

describe('Math Module - Vectors, Matrices, and Geometry', () => {
    test('Complex arithmetic and magnitude squared', () => {
        const c1 = new Complex(3, 4);
        assert.strictEqual(c1.abs2(), 25);
        assert.strictEqual(complexAbs2({ re: 3, im: 4 }), 25);

        const c2 = new Complex(1, 2);
        const added = c1.add(c2);
        assert.strictEqual(added.re, 4);
        assert.strictEqual(added.im, 6);

        const multiplied = c1.mul(c2); // (3+4i)*(1+2i) = 3 + 6i + 4i - 8 = -5 + 10i
        assert.strictEqual(multiplied.re, -5);
        assert.strictEqual(multiplied.im, 10);
    });

    test('3D vector operations and Rodrigues rotation', () => {
        const v = [0, 3, 4];
        const normalized = vec3Normalize(v);
        assert.strictEqual(normalized[0], 0);
        assert.strictEqual(normalized[1], 0.6);
        assert.strictEqual(normalized[2], 0.8);

        // Rotate [1, 0, 0] around Z-axis [0, 0, 1] by 90 degrees -> [0, 1, 0]
        const rotated = rodriguesRotate([1, 0, 0], [0, 0, 1], Math.PI / 2);
        assert.ok(Math.abs(rotated[0] - 0) < 1e-6);
        assert.ok(Math.abs(rotated[1] - 1) < 1e-6);
        assert.ok(Math.abs(rotated[2] - 0) < 1e-6);
    });

    test('Vector interpolation (Slerp)', () => {
        const v1 = [1, 0, 0];
        const v2 = [0, 1, 0];
        const mid = interpolateVector(v1, v2, 0.5);
        assert.ok(Math.abs(mid[0] - Math.SQRT1_2) < 1e-3);
        assert.ok(Math.abs(mid[1] - Math.SQRT1_2) < 1e-3);
    });

    test('Distance to segment', () => {
        const p = [0, 5];
        const start = [-10, 0];
        const end = [10, 0];
        const dist = distanceToSegment(p, start, end);
        assert.strictEqual(dist, 5);
    });

    test('3D to 2D projection', () => {
        const proj = createPerspectiveMatrix(Math.PI / 4, 1.0, 0.1, 100);
        const view = createTranslationMatrix(0, 0, -3);
        const screenPoint = projectPoint([0, 0, 0], mult(proj, view), 800, 600);
        assert.deepStrictEqual(screenPoint, [400, 300]);
    });
});

describe('Quantum Math Module - States, Bloch, Hamming, and Phase', () => {
    test('Amplitude string parsing', () => {
        assert.deepStrictEqual(parseAmplitude('1'), { re: 1, im: 0 });
        assert.deepStrictEqual(parseAmplitude('-0.7071'), { re: -0.7071, im: 0 });
        assert.deepStrictEqual(parseAmplitude('i'), { re: 0, im: 1 });
        assert.deepStrictEqual(parseAmplitude('-i'), { re: 0, im: -1 });
        assert.deepStrictEqual(parseAmplitude('0.5+0.866i'), { re: 0.5, im: 0.866 });
    });

    test('isTrivialState detects ground state', () => {
        assert.strictEqual(isTrivialState({ qubits: 2, amplitudes: [{ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }] }), true);
        assert.strictEqual(isTrivialState({ qubits: 1, amplitudes: [{ re: 0.7071, im: 0 }, { re: 0.7071, im: 0 }] }), false);
    });

    test('extractQubitBloch for single qubit basis states', () => {
        // |0⟩ -> [0, 0, 1]
        const state0 = { qubits: 1, amplitudes: [{ re: 1, im: 0 }, { re: 0, im: 0 }] };
        assert.deepStrictEqual(extractQubitBloch(state0, 0), [0, 0, 1]);

        // |1⟩ -> [0, 0, -1]
        const state1 = { qubits: 1, amplitudes: [{ re: 0, im: 0 }, { re: 1, im: 0 }] };
        assert.deepStrictEqual(extractQubitBloch(state1, 0), [0, 0, -1]);

        // |+⟩ -> [1, 0, 0]
        const statePlus = { qubits: 1, amplitudes: [{ re: Math.SQRT1_2, im: 0 }, { re: Math.SQRT1_2, im: 0 }] };
        const blochPlus = extractQubitBloch(statePlus, 0);
        assert.ok(Math.abs(blochPlus[0] - 1) < 1e-6);
        assert.ok(Math.abs(blochPlus[1] - 0) < 1e-6);
        assert.ok(Math.abs(blochPlus[2] - 0) < 1e-6);
    });

    test('Hamming weight and Q-sphere coordinate rings', () => {
        assert.strictEqual(hammingWeight(0), 0);
        assert.strictEqual(hammingWeight(1), 1);
        assert.strictEqual(hammingWeight(3), 2);
        assert.strictEqual(hammingWeight(7), 3);

        const pts = computeQspherePoints(3);
        assert.strictEqual(pts.length, 8);
        assert.strictEqual(pts[0].y, 1);  // |000⟩ at North Pole
        assert.strictEqual(pts[7].y, -1); // |111⟩ at South Pole
    });

    test('Phase to RGB color mapping and formatting', () => {
        const rgb0 = getPhaseToRgb(0);
        const rgbPi = getPhaseToRgb(Math.PI);
        assert.notDeepStrictEqual(rgb0, rgbPi);

        assert.strictEqual(formatBasisState(2, 3), '|010⟩');
        assert.strictEqual(formatPhasePi(0), '0');
        assert.strictEqual(formatPhasePi(Math.PI / 2), 'π/2');
        assert.strictEqual(formatPhasePi(Math.PI), 'π');
    });

    test('State transition step convergence', () => {
        const curr = [{ re: 0, im: 0 }, { re: 0, im: 0 }];
        const target = [{ re: 1, im: 0 }, { re: 0, im: 0 }];
        let step = stepStatevectorTransition(curr, target, 0.5);
        assert.strictEqual(step.isTransitioning, true);
        assert.strictEqual(step.currentAmplitudes[0].re, 0.5);

        // Run until convergence
        for (let i = 0; i < 20; i++) {
            step = stepStatevectorTransition(step.currentAmplitudes, target, 0.5);
        }
        assert.strictEqual(step.isTransitioning, false);
        assert.strictEqual(step.currentAmplitudes[0].re, 1);
    });

    test('formatQuantumStateKaTeX formats basis states, signs, and superpositions', () => {
        // Ground states
        assert.strictEqual(formatQuantumStateKaTeX([{ re: 1, im: 0 }, { re: 0, im: 0 }]), '|0\\rangle');
        assert.strictEqual(formatQuantumStateKaTeX([{ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }]), '|00\\rangle');
        assert.strictEqual(formatQuantumStateKaTeX([], 3), '|000\\rangle');

        // Single basis states with sign / phase
        assert.strictEqual(formatQuantumStateKaTeX([{ re: 0, im: 0 }, { re: 1, im: 0 }]), '|1\\rangle');
        assert.strictEqual(formatQuantumStateKaTeX([{ re: 0, im: 0 }, { re: -1, im: 0 }]), '- |1\\rangle');
        assert.strictEqual(formatQuantumStateKaTeX([{ re: 0, im: 1 }, { re: 0, im: 0 }]), 'i|0\\rangle');
        assert.strictEqual(formatQuantumStateKaTeX([{ re: 0, im: 0 }, { re: 0, im: -1 }]), '- i|1\\rangle');

        // Bell state (|00⟩ + |11⟩) / √2
        const bellAmps = [{ re: Math.SQRT1_2, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: Math.SQRT1_2, im: 0 }];
        assert.strictEqual(formatQuantumStateKaTeX(bellAmps), '\\frac{1}{\\sqrt{2}}|00\\rangle + \\frac{1}{\\sqrt{2}}|11\\rangle');

        // Minus state (|0⟩ - |1⟩) / √2
        const minusAmps = [{ re: Math.SQRT1_2, im: 0 }, { re: -Math.SQRT1_2, im: 0 }];
        assert.strictEqual(formatQuantumStateKaTeX(minusAmps), '\\frac{1}{\\sqrt{2}}|0\\rangle - \\frac{1}{\\sqrt{2}}|1\\rangle');

        // Plus-i state (|0⟩ + i|1⟩) / √2
        const plusIAmps = [{ re: Math.SQRT1_2, im: 0 }, { re: 0, im: Math.SQRT1_2 }];
        assert.strictEqual(formatQuantumStateKaTeX(plusIAmps), '\\frac{1}{\\sqrt{2}}|0\\rangle + \\frac{i}{\\sqrt{2}}|1\\rangle');

        // Minus-i state (|0⟩ - i|1⟩) / √2
        const minusIAmps = [{ re: Math.SQRT1_2, im: 0 }, { re: 0, im: -Math.SQRT1_2 }];
        assert.strictEqual(formatQuantumStateKaTeX(minusIAmps), '\\frac{1}{\\sqrt{2}}|0\\rangle - \\frac{i}{\\sqrt{2}}|1\\rangle');

        // Uniform 2-qubit superposition (|00⟩ + |01⟩ + |10⟩ + |11⟩) / 2 -> formats as \frac{1}{2}
        const uniform2Q = [{ re: 0.5, im: 0 }, { re: 0.5, im: 0 }, { re: 0.5, im: 0 }, { re: 0.5, im: 0 }];
        assert.strictEqual(formatQuantumStateKaTeX(uniform2Q), '\\frac{1}{2}|00\\rangle + \\frac{1}{2}|01\\rangle + \\frac{1}{2}|10\\rangle + \\frac{1}{2}|11\\rangle');

        // Pure imaginary \frac{i}{2}
        const imagHalf = [{ re: 0, im: 0 }, { re: 0, im: 0.5 }];
        assert.strictEqual(formatQuantumStateKaTeX(imagHalf), '\\frac{i}{2}|1\\rangle');

        // Any rational fractions m/n (m < n) such as \frac{1}{4}, \frac{3}{4}, \frac{2}{3}
        const quarterAmps = [{ re: 0.25, im: 0 }, { re: 0.75, im: 0 }];
        assert.strictEqual(formatQuantumStateKaTeX(quarterAmps), '\\frac{1}{4}|0\\rangle + \\frac{3}{4}|1\\rangle');

        const twoThirdsAmps = [{ re: 2 / 3, im: 0 }, { re: 1 / 3, im: 0 }];
        assert.strictEqual(formatQuantumStateKaTeX(twoThirdsAmps), '\\frac{2}{3}|0\\rangle + \\frac{1}{3}|1\\rangle');

        // Standard W-state radical 1/sqrt(3) and any 1/sqrt(n)
        const w3Amps = [
            { re: 0, im: 0 },
            { re: 1 / Math.sqrt(3), im: 0 },
            { re: 1 / Math.sqrt(3), im: 0 },
            { re: 0, im: 0 },
            { re: 1 / Math.sqrt(3), im: 0 }
        ];
        assert.strictEqual(formatQuantumStateKaTeX(w3Amps, 3), '\\frac{1}{\\sqrt{3}}|001\\rangle + \\frac{1}{\\sqrt{3}}|010\\rangle + \\frac{1}{\\sqrt{3}}|100\\rangle');

        // Any 1/sqrt(n): e.g. n=5, n=6, n=7, n=10
        const sqrt5Amps = [{ re: 1 / Math.sqrt(5), im: 0 }, { re: 0, im: 1 / Math.sqrt(5) }];
        assert.strictEqual(formatQuantumStateKaTeX(sqrt5Amps), '\\frac{1}{\\sqrt{5}}|0\\rangle + \\frac{i}{\\sqrt{5}}|1\\rangle');

        const sqrt10Amps = [{ re: 1 / Math.sqrt(10), im: 0 }, { re: -1 / Math.sqrt(10), im: 0 }];
        assert.strictEqual(formatQuantumStateKaTeX(sqrt10Amps), '\\frac{1}{\\sqrt{10}}|0\\rangle - \\frac{1}{\\sqrt{10}}|1\\rangle');

        // Complex coefficients
        const complexHalfAmps = [{ re: 0.5, im: 0.5 }, { re: 0.5, im: -0.5 }];
        assert.strictEqual(formatQuantumStateKaTeX(complexHalfAmps), '\\left(\\frac{1}{2} + \\frac{1}{2}i\\right)|0\\rangle + \\left(\\frac{1}{2} - \\frac{1}{2}i\\right)|1\\rangle');

        const complexDecAmps = [{ re: 0.6, im: 0.8 }, { re: 0.6, im: -0.8 }];
        assert.strictEqual(formatQuantumStateKaTeX(complexDecAmps), '\\left(\\frac{3}{5} + \\frac{4}{5}i\\right)|0\\rangle + \\left(\\frac{3}{5} - \\frac{4}{5}i\\right)|1\\rangle');

        // Snapshot and result object inputs
        const snapshot = { qubits: 2, amplitudes: bellAmps };
        assert.strictEqual(formatQuantumStateKaTeX(snapshot), '\\frac{1}{\\sqrt{2}}|00\\rangle + \\frac{1}{\\sqrt{2}}|11\\rangle');

        const resultObj = { states: [snapshot], qubitsDeclared: 2 };
        assert.strictEqual(formatQuantumStateKaTeX(resultObj), '\\frac{1}{\\sqrt{2}}|00\\rangle + \\frac{1}{\\sqrt{2}}|11\\rangle');

        // Options: symbolic false & includeStateSymbol
        assert.strictEqual(formatQuantumStateKaTeX(minusAmps, { symbolic: false }), '0.7071|0\\rangle - 0.7071|1\\rangle');
        assert.strictEqual(formatQuantumStateKaTeX(minusAmps, { includeStateSymbol: true }), '|\\psi\\rangle = \\frac{1}{\\sqrt{2}}|0\\rangle - \\frac{1}{\\sqrt{2}}|1\\rangle');

        // Alias stateToKaTeX
        assert.strictEqual(stateToKaTeX(bellAmps), formatQuantumStateKaTeX(bellAmps));
    });
});


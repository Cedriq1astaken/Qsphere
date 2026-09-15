import { complexAbs2 } from './math.js';

function parseAmplitude(value) {
    const normalized = String(value || '')
        .replace(/\s/g, '')
        .replace(/𝑖/g, 'i')
        .replace(/[−–—]/g, '-');
    if (normalized === 'i' || normalized === '+i') return { re: 0, im: 1 };
    if (normalized === '-i') return { re: 0, im: -1 };
    const complex = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([+-](?:\d+(?:\.\d*)?|\.\d+)?(?:e[+-]?\d+)?)i$/i);
    if (complex) {
        const imPart = complex[2] === '+' || complex[2] === '' ? 1 : (complex[2] === '-' ? -1 : Number(complex[2]));
        return { re: Number(complex[1]), im: imPart };
    }
    const imaginary = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?(?:e[+-]?\d+)?)i$/i);
    if (imaginary) {
        const imPart = imaginary[1] === '+' || imaginary[1] === '' ? 1 : (imaginary[1] === '-' ? -1 : Number(imaginary[1]));
        return { re: 0, im: imPart };
    }
    const real = Number.parseFloat(normalized);
    return { re: Number.isFinite(real) ? real : 0, im: 0 };
}

function isTrivialState(snapshot) {
    if (!snapshot || snapshot.qubits === 0) return true;
    const amps = snapshot.amplitudes;
    if (Math.abs(amps[0].re - 1) > 1e-8 || Math.abs(amps[0].im) > 1e-8) return false;
    for (let i = 1; i < amps.length; i++) {
        if (Math.abs(amps[i].re) > 1e-8 || Math.abs(amps[i].im) > 1e-8) return false;
    }
    return true;
}

function getQsphereState(result) {
    const states = result?.states || [];
    const latest = states.length > 0 ? states[states.length - 1] : null;
    const N = latest?.qubits || result?.qubitsDeclared || 0;
    const state = latest?.amplitudes || Array.from(
        { length: 2 ** N },
        () => ({ re: 0, im: 0 })
    );
    return { state, N };
}

function extractQubitBloch(snapshot, targetQubit = 0) {
    if (!snapshot || snapshot.qubits === 0 || targetQubit >= snapshot.qubits) return [0, 0, 1];
    const state = snapshot.amplitudes;
    const qubits = snapshot.qubits;
    const bit = 1 << (qubits - 1 - targetQubit);
    let rho00 = 0;
    let rho11 = 0;
    let rho10Re = 0;
    let rho10Im = 0;

    for (let i = 0; i < state.length; i++) {
        if (i & bit) continue;
        const j = i | bit;
        const ci = state[i] || { re: 0, im: 0 };
        const cj = state[j] || { re: 0, im: 0 };
        rho00 += complexAbs2(ci);
        rho11 += complexAbs2(cj);
        rho10Re += ci.re * cj.re + ci.im * cj.im;
        rho10Im += ci.re * cj.im - ci.im * cj.re;
    }
    return [2 * rho10Re, 2 * rho10Im, rho00 - rho11];
}

function hammingWeight(n) {
    let count = 0;
    while (n > 0) {
        count += n & 1;
        n >>>= 1;
    }
    return count;
}

function computeQspherePoints(N) {
    const size = 2 ** N;
    const groupSizes = new Array(N + 1).fill(0);
    const weights = new Array(size);
    for (let k = 0; k < size; k++) {
        const w = hammingWeight(k);
        weights[k] = w;
        groupSizes[w]++;
    }

    const runningCount = new Array(N + 1).fill(0);
    const points = new Array(size);

    for (let k = 0; k < size; k++) {
        const w = weights[k];
        const M = groupSizes[w];
        const j = runningCount[w]++;
        const theta = N === 0 ? 0 : (Math.PI * w) / N;
        const phi = M === 1 ? 0 : (2 * Math.PI * j) / M;
        points[k] = {
            index: k,
            x: Math.sin(theta) * Math.cos(phi),
            y: Math.cos(theta),
            z: Math.sin(theta) * Math.sin(phi),
            w
        };
    }

    return points;
}

function getPhaseToRgb(phase) {
    const deg = ((phase / (2 * Math.PI)) * 360 + 360) % 360;
    const s = 0.68, l = 0.68;
    const k = n => (n + deg / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
}

function formatBasisState(index, qubits) {
    return `|${index.toString(2).padStart(qubits, '0')}⟩`;
}

function formatPhasePi(phase) {
    const twoPi = Math.PI * 2;
    const normalized = ((phase % twoPi) + twoPi) % twoPi;
    const units = normalized / Math.PI;
    const known = [
        [0, '0'],
        [0.5, 'π/2'],
        [1, 'π'],
        [1.5, '3π/2'],
        [2, '0']
    ];

    for (const [value, label] of known) {
        if (Math.abs(units - value) < 0.03) return label;
    }
    return `${units.toFixed(2)}π`;
}

function stepStatevectorTransition(currentAmplitudes, targetAmplitudes, lerpFactor = 0.25, threshold = 1e-4) {
    let anyDifference = false;
    for (let i = 0; i < targetAmplitudes.length; i++) {
        const curr = currentAmplitudes[i] || (currentAmplitudes[i] = { re: 0, im: 0 });
        const target = targetAmplitudes[i] || { re: 0, im: 0 };

        const currR = Math.sqrt(curr.re * curr.re + curr.im * curr.im);
        const targetR = Math.sqrt(target.re * target.re + target.im * target.im);

        const currTheta = Math.atan2(curr.im, curr.re);
        const targetTheta = Math.atan2(target.im, target.re);

        const diffR = targetR - currR;
        let diffTheta = targetTheta - currTheta;

        while (diffTheta < -Math.PI) diffTheta += Math.PI * 2;
        while (diffTheta > Math.PI) diffTheta -= Math.PI * 2;

        const rChanged = Math.abs(diffR) > threshold;
        const thetaChanged = targetR > threshold && Math.abs(diffTheta) > threshold;

        if (rChanged || thetaChanged) {
            const nextR = currR + diffR * lerpFactor;
            const nextTheta = currTheta + (thetaChanged ? diffTheta * lerpFactor : 0);

            curr.re = nextR * Math.cos(nextTheta);
            curr.im = nextR * Math.sin(nextTheta);
            anyDifference = true;
        } else {
            curr.re = target.re;
            curr.im = target.im;
        }
    }

    return {
        isTransitioning: anyDifference,
        currentAmplitudes
    };
}

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a;
}

/**
 * Converts a quantum state (amplitudes array, snapshot, or visualizer result) into a KaTeX / LaTeX string.
 * @param {Array<{re: number, im: number}> | { amplitudes: Array, qubits?: number } | { states: Array }} stateInput
 * @param {number | { qubits?: number, threshold?: number, precision?: number, symbolic?: boolean, includeStateSymbol?: boolean | string, ketPrefix?: string, ketSuffix?: string }} [options]
 * @returns {string} KaTeX formatted quantum state string
 */
function formatQuantumStateKaTeX(stateInput, options = {}) {
    const opts = typeof options === 'number' ? { qubits: options } : (options || {});
    const threshold = typeof opts.threshold === 'number' ? opts.threshold : 1e-4;
    const precision = typeof opts.precision === 'number' ? opts.precision : 4;
    const symbolic = opts.symbolic !== false;
    const ketPrefix = opts.ketPrefix || '|';
    const ketSuffix = opts.ketSuffix || '\\rangle';

    let amplitudes = [];
    let N = opts.qubits;

    if (Array.isArray(stateInput)) {
        amplitudes = stateInput;
    } else if (stateInput && Array.isArray(stateInput.amplitudes)) {
        amplitudes = stateInput.amplitudes;
        if (N === undefined && typeof stateInput.qubits === 'number') {
            N = stateInput.qubits;
        }
    } else if (stateInput && (Array.isArray(stateInput.states) || typeof stateInput.qubitsDeclared === 'number')) {
        const qstate = getQsphereState(stateInput);
        amplitudes = qstate.state;
        if (N === undefined) N = qstate.N;
    }

    if (!amplitudes || amplitudes.length === 0) {
        const numQubits = typeof N === 'number' && N > 0 ? N : 1;
        return `${ketPrefix}${'0'.repeat(numQubits)}${ketSuffix}`;
    }

    if (typeof N !== 'number' || N <= 0) {
        N = Math.max(1, Math.round(Math.log2(amplitudes.length)));
    }

    const eps = 1e-4;

    function formatMag(val) {
        const absVal = Math.abs(val);
        if (symbolic) {
            if (Math.abs(absVal - 1) < eps) return '1';

            // 1. Check 1/sqrt(n) for any integer n (n = 2..100)
            const nCand = Math.round(1 / (absVal * absVal));
            if (nCand >= 2 && nCand <= 100 && Math.abs(absVal - 1 / Math.sqrt(nCand)) < eps) {
                const s = Math.round(Math.sqrt(nCand));
                if (s * s === nCand) {
                    return `\\frac{1}{${s}}`;
                }
                let sqFactor = 1;
                for (let k = Math.floor(Math.sqrt(nCand)); k >= 2; k--) {
                    if (nCand % (k * k) === 0) {
                        sqFactor = k;
                        break;
                    }
                }
                if (sqFactor > 1) {
                    return `\\frac{1}{${sqFactor}\\sqrt{${nCand / (sqFactor * sqFactor)}}}`;
                }
                return `\\frac{1}{\\sqrt{${nCand}}}`;
            }

            // 2. Check sqrt(m)/s where v^2 approx m/(s^2) for s = 2..12, m < s^2 (e.g. sqrt(3)/2)
            for (let s = 2; s <= 12; s++) {
                const den = s * s;
                const m = Math.round(absVal * absVal * den);
                if (m >= 2 && m < den && Math.abs(absVal - Math.sqrt(m) / s) < eps) {
                    let sqM = 1;
                    for (let k = Math.floor(Math.sqrt(m)); k >= 2; k--) {
                        if (m % (k * k) === 0) {
                            sqM = k;
                            break;
                        }
                    }
                    const remM = m / (sqM * sqM);
                    if (remM > 1) {
                        const numStr = sqM > 1 ? `${sqM}\\sqrt{${remM}}` : `\\sqrt{${remM}}`;
                        return `\\frac{${numStr}}{${s}}`;
                    }
                }
            }

            // 3. Check any rational fraction m/n for m < n (n = 2..64)
            for (let n = 2; n <= 64; n++) {
                const m = Math.round(absVal * n);
                if (m >= 1 && m < n && Math.abs(absVal - m / n) < eps) {
                    const g = gcd(m, n);
                    return `\\frac{${m / g}}{${n / g}}`;
                }
            }
        }
        const rounded = Number(absVal.toFixed(precision));
        return String(rounded);
    }

    function formatImagCoeff(mag) {
        if (mag === '1') return 'i';
        if (mag.startsWith('\\frac{1}{')) {
            return mag.replace(/^\\frac\{1\}\{/, '\\frac{i}{');
        }
        return `${mag}i`;
    }

    function formatCoeff(re, im, isFirst) {
        const isRealZero = Math.abs(re) < eps;
        const isImagZero = Math.abs(im) < eps;

        // Pure Real
        if (isImagZero) {
            const isOne = Math.abs(Math.abs(re) - 1) < eps;
            const mag = formatMag(re);

            if (re > 0) {
                if (isOne) return isFirst ? '' : '+ ';
                return isFirst ? `${mag}` : `+ ${mag}`;
            } else {
                if (isOne) return '- ';
                return `- ${mag}`;
            }
        }

        // Pure Imaginary
        if (isRealZero) {
            const mag = formatMag(im);
            const imagStr = formatImagCoeff(mag);
            return im > 0 ? (isFirst ? imagStr : `+ ${imagStr}`) : `- ${imagStr}`;
        }

        // Complex (both real and imaginary non-zero)
        const reMag = formatMag(re);
        const imMag = formatMag(im);
        const rePart = re < 0 ? `-${reMag}` : `${reMag}`;
        const imIsOne = Math.abs(Math.abs(im) - 1) < eps;
        const imPart = im > 0
            ? `+ ${imIsOne ? 'i' : imMag + 'i'}`
            : `- ${imIsOne ? 'i' : imMag + 'i'}`;

        const complexInner = `\\left(${rePart} ${imPart}\\right)`;
        return isFirst ? complexInner : `+ ${complexInner}`;
    }

    const terms = [];

    for (let i = 0; i < amplitudes.length; i++) {
        const rawAmp = amplitudes[i];
        const re = typeof rawAmp === 'number' ? rawAmp : (rawAmp?.re || 0);
        const im = typeof rawAmp === 'number' ? 0 : (rawAmp?.im || 0);
        const magSq = re * re + im * im;

        if (magSq < threshold * threshold) continue;

        const isFirst = terms.length === 0;
        const ket = `${ketPrefix}${i.toString(2).padStart(N, '0')}${ketSuffix}`;
        const coeffStr = formatCoeff(re, im, isFirst);

        terms.push(`${coeffStr}${ket}`);
    }

    if (terms.length === 0) {
        return `${ketPrefix}${'0'.repeat(N)}${ketSuffix}`;
    }

    const expr = terms.join(' ');
    if (opts.includeStateSymbol) {
        const sym = typeof opts.includeStateSymbol === 'string' ? opts.includeStateSymbol : '|\\psi\\rangle = ';
        return `${sym}${expr}`;
    }

    return expr;
}

const stateToKaTeX = formatQuantumStateKaTeX;

export {
    parseAmplitude,
    isTrivialState,
    getQsphereState,
    extractQubitBloch,
    hammingWeight,
    computeQspherePoints,
    getPhaseToRgb,
    formatBasisState,
    formatPhasePi,
    stepStatevectorTransition,
    formatQuantumStateKaTeX,
    stateToKaTeX
};

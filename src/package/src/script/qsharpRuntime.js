import { getDebugService, loadWasmModule, StepResultId } from 'qsharp-lang';

let wasmReady;
function ensureWasm(wasmUri) {
    if (!wasmReady) wasmReady = loadWasmModule(wasmUri);
    return wasmReady;
}

function parseAmplitude(value) {
    const normalized = String(value || '').replace(/\s/g, '').replace(/𝑖/g, 'i');
    const complex = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([+-](?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)i$/i);
    if (complex) return { re: Number(complex[1]), im: Number(complex[2]) };
    const imaginary = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)i$/i);
    if (imaginary) return { re: 0, im: Number(imaginary[1]) };
    const real = Number.parseFloat(normalized);
    return { re: Number.isFinite(real) ? real : 0, im: 0 };
}

function snapshotFromEntries(entries) {
    const basisEntries = entries
        .map(entry => ({ bits: String(entry.name || '').match(/^\|([01]+)⟩$/)?.[1], value: parseAmplitude(entry.value) }))
        .filter(entry => entry.bits);
    if (basisEntries.length === 0) return null;

    const qubits = Math.max(...basisEntries.map(entry => entry.bits.length));
    const amplitudes = Array.from({ length: 2 ** qubits }, () => ({ re: 0, im: 0 }));
    for (const entry of basisEntries) {
        const index = Number.parseInt(entry.bits, 2);
        if (index < amplitudes.length) amplitudes[index] = entry.value;
    }
    return { amplitudes, qubits };
}

function snapshotSignature(snapshot) {
    return `${snapshot.qubits}:${snapshot.amplitudes.map(value => `${value.re.toPrecision(12)},${value.im.toPrecision(12)}`).join(';')}`;
}

function formatFailure(message) {
    return typeof message === 'string' ? message.trim() : String(message || 'Unknown Q# execution error.');
}

async function executeQSharp(source, fileName, wasmUri) {
    await ensureWasm(wasmUri);
    const debugService = await getDebugService();
    const sourceName = fileName || 'main.qs';
    const result = { qubitsDeclared: 0, qubitsList: [], states: [], steps: [] };
    let lastSignature = null;

    try {
        const loadFailure = await debugService.loadProgram({
            sources: [[sourceName, source]],
            languageFeatures: [],
            profile: 'unrestricted'
        }, undefined);
        if (loadFailure && loadFailure.trim()) {
            result.error = formatFailure(loadFailure);
            return result;
        }

        const breakpoints = await debugService.getBreakpoints(sourceName);
        const breakpointIds = breakpoints.map(breakpoint => breakpoint.id);
        const events = { dispatchEvent: () => true };

        for (let stepNumber = 0; stepNumber < 10000; stepNumber++) {
            const step = await debugService.evalNext(breakpointIds, events);
            const snapshot = snapshotFromEntries(await debugService.captureQuantumState());
            if (snapshot) {
                result.qubitsDeclared = Math.max(result.qubitsDeclared, snapshot.qubits);
                const signature = snapshotSignature(snapshot);
                if (signature !== lastSignature) {
                    lastSignature = signature;
                    result.states.push(snapshot);
                }
            }

            result.steps.push({
                resultId: step.id,
                breakpointId: step.value,
                range: breakpoints.find(breakpoint => breakpoint.id === step.value)?.range || null
            });
            if (step.id === StepResultId.Fail) {
                result.error = formatFailure(step.error);
                break;
            }
            if (step.id === StepResultId.Return) break;
        }

        if (result.steps.length >= 10000 && !result.error) {
            result.error = 'Q# execution exceeded the 10,000-step safety limit.';
        }
        result.qubitsList = Array.from({ length: result.qubitsDeclared }, (_, index) => `q${index}`);
        return result;
    } finally {
        await debugService.dispose();
    }
}

function parseQSharp(source) {
    const canvas = document.querySelector('canvas');
    return executeQSharp(source, 'main.qs', canvas?.dataset.qsharpWasm);
}

if (typeof window !== 'undefined') {
    window.qsphereQSharpRuntime = { executeQSharp };
    window.parseQSharp = parseQSharp;
}

import { getDebugService, loadWasmModule, StepResultId } from 'qsharp-lang';

let wasmReady;
function ensureWasm(wasmUri) {
    if (!wasmReady) wasmReady = loadWasmModule(wasmUri);
    return wasmReady;
}

function parseAmplitude(value) {
    const normalized = String(value || '')
        .replace(/\s/g, '')
        .replace(/𝑖/g, 'i')
        .replace(/[−–—]/g, '-');
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

/** True when every qubit is in |0⟩ (the state produced by Reset). */
function isTrivialState(snapshot) {
    if (!snapshot || snapshot.qubits === 0) return true;
    const amps = snapshot.amplitudes;
    if (Math.abs(amps[0].re - 1) > 1e-8 || Math.abs(amps[0].im) > 1e-8) return false;
    for (let i = 1; i < amps.length; i++) {
        if (Math.abs(amps[i].re) > 1e-8 || Math.abs(amps[i].im) > 1e-8) return false;
    }
    return true;
}

function formatFailure(message) {
    return typeof message === 'string' ? message.trim() : String(message || 'Unknown Q# execution error.');
}

async function executeQSharp(source, fileName, wasmUri, targetOp) {
    await ensureWasm(wasmUri);
    const debugService = await getDebugService();
    const sourceName = fileName || 'main.qs';
    const result = { qubitsDeclared: 0, qubitsList: [], states: [], steps: [] };
    let lastSignature = null;

    // Detect lines containing Reset or ResetAll statements
    const resetPattern = /^\s*Reset(All)?\s*\(/i;
    const resetLines = new Set(
        (source || '').split('\n')
            .map((line, idx) => resetPattern.test(line) ? idx : -1)
            .filter(idx => idx >= 0)
    );

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

        let skipNextSnapshot = false;
        let targetOpWasActive = false;

        for (let stepNumber = 0; stepNumber < 10000; stepNumber++) {
            const step = await debugService.evalNext(breakpointIds, events);
            const range = breakpoints.find(breakpoint => breakpoint.id === step.value)?.range || null;
            const isTargetOpBreakpoint = Boolean(targetOp && range &&
                range.start.line >= targetOp.startLine && range.start.line <= targetOp.endLine);
            const isPostTargetOpSnapshot = Boolean(targetOp && targetOpWasActive &&
                (!range || !isTargetOpBreakpoint));
            const isInsideTargetOp = !targetOp || isTargetOpBreakpoint || isPostTargetOpSnapshot;

            const isResetLine = range && resetLines.has(range.start.line);

            const snapshot = snapshotFromEntries(await debugService.captureQuantumState());

            if (snapshot && isInsideTargetOp && !skipNextSnapshot) {
                result.qubitsDeclared = Math.max(result.qubitsDeclared, snapshot.qubits);
                const signature = snapshotSignature(snapshot);
                if (signature !== lastSignature) {
                    lastSignature = signature;
                    result.states.push(snapshot);
                }
            }

            if (isTargetOpBreakpoint) targetOpWasActive = true;
            if (isPostTargetOpSnapshot) targetOpWasActive = false;

            // Flag to skip the post-Reset state snapshot so Reset operations are invisible
            skipNextSnapshot = Boolean(isResetLine);

            result.steps.push({
                resultId: step.id,
                breakpointId: step.value,
                range
            });
            if (step.id === StepResultId.Fail) {
                if (result.states.length === 0) {
                    result.error = formatFailure(step.error);
                }
                break;
            }
            if (step.id === StepResultId.Return) break;
        }

        // Capture once more after stepping completes so the final operation's
        // post-gate state is not lost when it is the last breakpoint.
        const finalSnapshot = snapshotFromEntries(await debugService.captureQuantumState());
        if (finalSnapshot && (!targetOp || finalSnapshot.qubits > 0)) {
            result.qubitsDeclared = Math.max(result.qubitsDeclared, finalSnapshot.qubits);
            const signature = snapshotSignature(finalSnapshot);
            if (signature !== lastSignature) {
                lastSignature = signature;
                result.states.push(finalSnapshot);
            }

        }

        if (result.steps.length >= 10000 && !result.error) {
            result.error = 'Q# execution exceeded the 10,000-step safety limit.';
        }

        // Keep only full quantum system snapshots matching qubitsDeclared,
        // ignoring partial allocation/deallocation steps during scope entry/exit.
        if (result.qubitsDeclared > 0) {
            result.states = result.states.filter(snap => snap.qubits === result.qubitsDeclared);
        }

        // Drop initial un-operated ground state |0…0⟩ before gates execute
        while (result.states.length > 1 && isTrivialState(result.states[0])) {
            result.states.shift();
        }

        // Drop trailing trivial |0…0⟩ states caused by deallocation
        while (result.states.length > 1 && isTrivialState(result.states[result.states.length - 1])) {
            result.states.pop();
        }

        result.qubitsList = Array.from({ length: result.qubitsDeclared }, (_, index) => `q${index}`);
        return result;
    } finally {
        await debugService.dispose();
    }
}

function parseQSharp(source, targetOp) {
    const canvas = document.querySelector('canvas');
    return executeQSharp(source, 'main.qs', canvas?.dataset.qsharpWasm, targetOp);
}

if (typeof window !== 'undefined') {
    window.qsphereQSharpRuntime = { executeQSharp };
    window.parseQSharp = parseQSharp;
}

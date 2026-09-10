import { getDebugService, loadWasmModule, StepResultId } from 'qsharp-lang';
import { parseAmplitude, isTrivialState } from '../math/index.js';

let wasmReady;

function ensureWasm(wasmUri) {
    if (!wasmReady) wasmReady = loadWasmModule(wasmUri);
    return wasmReady;
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

function areSnapshotsEqual(snapshotA, snapshotB, tolerance = 1e-9) {
    if (!snapshotA || !snapshotB) return false;
    if (snapshotA.qubits !== snapshotB.qubits) return false;
    const ampsA = snapshotA.amplitudes;
    const ampsB = snapshotB.amplitudes;
    if (ampsA.length !== ampsB.length) return false;
    for (let i = 0; i < ampsA.length; i++) {
        const a = ampsA[i];
        const b = ampsB[i];
        if (Math.abs(a.re - b.re) > tolerance || Math.abs(a.im - b.im) > tolerance) {
            return false;
        }
    }
    return true;
}

function snapshotSignature(snapshot) {
    return `${snapshot.qubits}:${snapshot.amplitudes.map(value => `${value.re.toPrecision(12)},${value.im.toPrecision(12)}`).join(';')}`;
}

function formatFailure(message) {
    return typeof message === 'string' ? message.trim() : String(message || 'Unknown Q# execution error.');
}

async function executeQSharp(source, fileName, wasmUri, targetOp, targetLine) {
    await ensureWasm(wasmUri);
    const debugService = await getDebugService();
    const sourceName = fileName || 'main.qs';
    const result = { qubitsDeclared: 0, qubitsList: [], states: [], steps: [] };
    let lastSnapshot = null;

    const resetPattern = /^\s*Reset(All)?\s*\(/i;
    const resetLines = new Set(
        (source || '').split('\n')
            .map((line, idx) => resetPattern.test(line) ? idx : -1)
            .filter(idx => idx >= 0)
    );

    const hasTargetLine = typeof targetLine === 'number' && targetLine >= 0;

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

        for (let stepNumber = 0; stepNumber < 10000; stepNumber++) {
            let step;
            try {
                step = await debugService.evalNext(breakpointIds, events);
            } catch (err) {
                if (result.states.length === 0) {
                    result.error = formatFailure(err?.message || err);
                }
                break;
            }

            const range = breakpoints.find(breakpoint => breakpoint.id === step.value)?.range || null;
            let stackFrames = [];
            if (targetOp) {
                try {
                    stackFrames = await debugService.getStackFrames();
                } catch (e) {}
            }
            const isInsideTargetOp = !targetOp || stackFrames.some(
                frame => frame.name.trim() === targetOp.name
            );

            const isResetLine = range && resetLines.has(range.start.line);

            if (isInsideTargetOp && !skipNextSnapshot) {
                let captured = [];
                try {
                    captured = await debugService.captureQuantumState();
                } catch (e) {}
                const snapshot = snapshotFromEntries(captured);

                if (snapshot) {
                    result.qubitsDeclared = Math.max(result.qubitsDeclared, snapshot.qubits);
                    if (!areSnapshotsEqual(snapshot, lastSnapshot)) {
                        lastSnapshot = snapshot;
                        result.states.push(snapshot);
                    }
                }
            }

            skipNextSnapshot = Boolean(isResetLine);

            result.steps.push({
                resultId: step.id,
                breakpointId: step.value,
                range
            });

            if (hasTargetLine && range && range.start.line > targetLine) {
                break;
            }

            if (step.id === StepResultId.Fail) {
                if (result.states.length === 0) {
                    result.error = formatFailure(step.error);
                }
                break;
            }
            if (step.id === StepResultId.Return) break;
        }

        if (!hasTargetLine || result.states.length === 0) {
            let captured = [];
            try {
                captured = await debugService.captureQuantumState();
            } catch (e) {}
            const finalSnapshot = snapshotFromEntries(captured);
            if (finalSnapshot && (!targetOp || finalSnapshot.qubits > 0)) {
                result.qubitsDeclared = Math.max(result.qubitsDeclared, finalSnapshot.qubits);
                if (!areSnapshotsEqual(finalSnapshot, lastSnapshot)) {
                    lastSnapshot = finalSnapshot;
                    result.states.push(finalSnapshot);
                }
            }
        }

        if (result.steps.length >= 10000 && !result.error) {
            result.error = 'Q# execution exceeded the 10,000-step safety limit.';
        }

        if (result.qubitsDeclared > 0) {
            result.states = result.states.filter(snap => snap.qubits === result.qubitsDeclared);
        }

        while (result.states.length > 1 && isTrivialState(result.states[0])) {
            result.states.shift();
        }

        result.qubitsList = Array.from({ length: result.qubitsDeclared }, (_, index) => `q${index}`);
        return result;
    } finally {
        await debugService.dispose();
    }
}

function parseQSharp(source, targetOp, targetLine) {
    const wasmElement = typeof document !== 'undefined' ? document.querySelector('[data-qsharp-wasm]') : null;
    return executeQSharp(source, 'main.qs', wasmElement?.dataset?.qsharpWasm, targetOp, targetLine);
}

if (typeof window !== 'undefined') {
    window.parseQSharp = parseQSharp;
}

export {
    ensureWasm,
    snapshotFromEntries,
    areSnapshotsEqual,
    snapshotSignature,
    formatFailure,
    executeQSharp,
    parseQSharp
};

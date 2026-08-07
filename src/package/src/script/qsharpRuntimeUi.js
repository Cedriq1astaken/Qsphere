// Protect the visualizer from out-of-order asynchronous parser results. A fast
// edit can finish before an older, slower Q# execution.
(function () {
    const parseQSharp = window.parseQSharp;
    if (typeof parseQSharp !== 'function') return;

    let lastSuccessfulResult = null;
    let requestGeneration = 0;

    // Clear stale status text after a successful or recoverable parse.
    function showResult(result) {
        const status = document.querySelector('#status');
        if (status) status.textContent = '';
        return result;
    }

    // Keep the last valid result visible while invalid edits or stale requests settle.
    window.parseQSharp = async function (source, targetOp) {
        const requestId = ++requestGeneration;
        try {
            const result = await parseQSharp(source, targetOp);
            if (requestId !== requestGeneration) {
                return lastSuccessfulResult || result;
            }
            if (result?.error) {
                showResult(result);
                // Keep the previous visualization committed while the edit is invalid.
                return lastSuccessfulResult || result;
            }
            lastSuccessfulResult = result;
            return showResult(result);
        } catch (error) {
            const failure = {
                qubitsDeclared: 0,
                qubitsList: [],
                states: [],
                steps: [],
                error: String(error)
            };
            if (requestId !== requestGeneration) {
                return lastSuccessfulResult || failure;
            }
            showResult(failure);
            return lastSuccessfulResult || failure;
        }
    };
})();

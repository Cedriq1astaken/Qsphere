import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('StateVisualizer extension active for .qs, .py, and .qasm files!');

    let activeTargetOp: { name: string, startLine: number, endLine: number } | undefined;
    let activePanel: vscode.WebviewPanel | undefined;
    let pendingInspectPayload: {
        fileName: string;
        code: string;
        targetLine: number;
        lineText: string;
        targetOp?: { name: string; startLine: number; endLine: number };
    } | null = null;

    const openVisualizerDisposable = vscode.commands.registerCommand('qsphere.openVisualizer', (targetOp?: { name: string, startLine: number, endLine: number }) => {
        if (targetOp) {
            activeTargetOp = targetOp;
        }

        const activeEditor = vscode.window.activeTextEditor;
        const sourceDocument = activeEditor?.document;
        const defaultSamplePath = path.join(context.extensionPath, 'samples', 'test.qs');
        const fileName = sourceDocument?.fileName || defaultSamplePath;
        let codeContent = sourceDocument?.getText() || '';

        if (!codeContent && fs.existsSync(defaultSamplePath)) {
            codeContent = fs.readFileSync(defaultSamplePath, 'utf8');
        }

        const titleName = 'StateVisualizer';

        const panel = vscode.window.createWebviewPanel(
            'qsphereVisualizer',
            titleName,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(context.extensionPath)]
            }
        );
        activePanel = panel;

        panel.webview.html = getWebviewContent(context, panel.webview);

        const postSource = (command: 'init' | 'update', code: string, sourceName: string) => {
            panel.webview.postMessage({ command, data: { fileName: sourceName, code, targetOp: activeTargetOp } });
        };

        const readyDisposable = panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'ready') {
                if (pendingInspectPayload) {
                    panel.webview.postMessage({
                        command: 'inspectLine',
                        data: pendingInspectPayload
                    });
                    pendingInspectPayload = null;
                    return;
                }
                const currentEditor = vscode.window.activeTextEditor;
                postSource(
                    'init',
                    currentEditor?.document.getText() || codeContent,
                    currentEditor?.document.fileName || fileName
                );
                return;
            }

            if (message.command === 'exportFiles') {
                try {
                    const payload = message.data || {};
                    const items: Array<{ name?: string; pngDataUrl?: string; svgContent?: string }> =
                        Array.isArray(payload.files) && payload.files.length > 0
                            ? payload.files
                            : [{ name: payload.name, pngDataUrl: payload.pngDataUrl, svgContent: payload.svgContent }];

                    // Generate timestamp formatted as YYYY-MM-DD_HH-mm-ss
                    const now = new Date();
                    const pad = (n: number) => String(n).padStart(2, '0');
                    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

                    // Determine target directory (active .qs file dir -> workspace root -> cwd)
                    const activeDoc = vscode.window.activeTextEditor?.document;
                    let targetDir = '';
                    if (activeDoc && !activeDoc.isUntitled && activeDoc.fileName) {
                        targetDir = path.dirname(activeDoc.fileName);
                    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                        targetDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
                    } else {
                        targetDir = process.cwd();
                    }

                    const exportedNames: string[] = [];

                    for (const item of items) {
                        const vizName = item.name || 'visualization';
                        const pngFileName = `${vizName}_${timestamp}.png`;
                        const pngFilePath = path.join(targetDir, pngFileName);

                        if (item.pngDataUrl) {
                            const base64Data = item.pngDataUrl.replace(/^data:image\/png;base64,/, '');
                            await fs.promises.writeFile(pngFilePath, Buffer.from(base64Data, 'base64'));
                            exportedNames.push(pngFileName);
                        }
                    }

                    if (exportedNames.length > 0) {
                        vscode.window.showInformationMessage(
                            `StateVisualizer: Exported ${exportedNames.join(', ')}`
                        );
                    }
                } catch (err) {
                    console.error('Error exporting visualization files:', err);
                    vscode.window.showErrorMessage(`StateVisualizer export failed: ${String(err)}`);
                }
            }

            if (message.command === 'copyToClipboard') {
                if (typeof message.text === 'string') {
                    await vscode.env.clipboard.writeText(message.text);
                    vscode.window.setStatusBarMessage('StateVisualizer: Copied quantum state LaTeX to clipboard', 2500);
                }
            }
        });

        postSource('init', codeContent, fileName);

        let updateTimer: ReturnType<typeof setTimeout> | undefined;
        const trackedUri = sourceDocument?.uri.toString();
        const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
            const fn = event.document.fileName;
            if (!fn.endsWith('.qs') && !fn.endsWith('.py') && !fn.endsWith('.qasm') && !fn.endsWith('.openqasm')) return;
            if (trackedUri && event.document.uri.toString() !== trackedUri) return;

            // Clear any previous line inspection decoration when text is edited / newlines inserted
            vscode.window.visibleTextEditors.forEach(editor => {
                if (editor.document.uri.toString() === event.document.uri.toString()) {
                    editor.setDecorations(lineHighlightDecoration, []);
                }
            });

            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                postSource('update', event.document.getText(), event.document.fileName);
            }, 150);
        });

        panel.onDidDispose(() => {
            if (updateTimer) clearTimeout(updateTimer);
            if (activePanel === panel) activePanel = undefined;
            readyDisposable.dispose();
            changeDisposable.dispose();
            vscode.window.visibleTextEditors.forEach(editor => {
                editor.setDecorations(lineHighlightDecoration, []);
            });
        });
    });

    const lineHighlightDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        backgroundColor: 'rgba(56, 189, 248, 0.22)',
        border: '1px solid rgba(56, 189, 248, 0.60)',
        borderRadius: '3px',
        overviewRulerColor: '#38bdf8',
        overviewRulerLane: vscode.OverviewRulerLane.Full,
        after: {
            contentText: '  ◀ Visualized State',
            color: 'rgba(56, 189, 248, 0.85)',
            fontStyle: 'italic',
            fontWeight: '600'
        }
    });

    function findMainOperation(doc: vscode.TextDocument): { name: string, startLine: number, endLine: number } | null {
        const operationPattern = /^\s*operation\s+([A-Za-z_][A-Za-z0-9_]*)/;
        let mainOp: { name: string, startLine: number, endLine: number } | null = null;
        let firstOp: { name: string, startLine: number, endLine: number } | null = null;

        for (let line = 0; line < doc.lineCount; line++) {
            const lineText = doc.lineAt(line).text;
            const match = lineText.match(operationPattern);
            if (!match) continue;
            const opName = match[1];

            let braceCount = 0;
            let foundOpenBrace = false;
            let endLine = line;
            for (let l = line; l < doc.lineCount; l++) {
                const currentText = doc.lineAt(l).text;
                for (const char of currentText) {
                    if (char === '{') {
                        braceCount++;
                        foundOpenBrace = true;
                    } else if (char === '}') {
                        braceCount--;
                        if (foundOpenBrace && braceCount === 0) {
                            endLine = l;
                            break;
                        }
                    }
                }
                if (foundOpenBrace && braceCount === 0) break;
                endLine = l;
            }

            const opInfo = { name: opName, startLine: line, endLine };
            if (!firstOp) firstOp = opInfo;

            const isEntryPoint = (line > 0 && doc.lineAt(line - 1).text.includes('@EntryPoint')) || opName === 'Main';
            if (isEntryPoint) {
                mainOp = opInfo;
                break;
            }
        }

        return mainOp || firstOp;
    }

    function findPythonCircuit(doc: vscode.TextDocument): { name: string, startLine: number, endLine: number } | null {
        // Detect aliased QuantumCircuit names
        const fullText = doc.getText();
        const aliasMatch = fullText.match(/from\s+qiskit(?:\.\w+)*\s+import\s+QuantumCircuit\s+as\s+(\w+)/);
        const classNames = ['QuantumCircuit'];
        if (aliasMatch) classNames.push(aliasMatch[1]);

        const classPattern = classNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const dynamicCircuitRe = new RegExp(`^(\\s*)(\\w+)\\s*=\\s*(?:\\w+\\.)*(?:${classPattern})\\s*\\(\\s*(?:num_qubits\\s*=\\s*)?(\\w+)`);

        for (let line = 0; line < doc.lineCount; line++) {
            const lineText = doc.lineAt(line).text;
            const match = lineText.match(dynamicCircuitRe);
            if (!match) continue;

            const varName = match[2];
            const varPattern = new RegExp(`\\b${varName}\\b`);

            // Find end of circuit usage (last line referencing varName)
            let endLine = line;
            for (let j = line + 1; j < doc.lineCount; j++) {
                if (varPattern.test(doc.lineAt(j).text)) endLine = j;
            }

            return { name: varName, startLine: line, endLine };
        }

        return null;
    }

    function findQasmCircuit(doc: vscode.TextDocument): { name: string, startLine: number, endLine: number } | null {
        if (doc.lineCount === 0) return null;
        let startLine = 0;
        for (let line = 0; line < doc.lineCount; line++) {
            const text = doc.lineAt(line).text.trim();
            if (text.length > 0 && !text.startsWith('//')) {
                startLine = line;
                break;
            }
        }
        const endLine = doc.lineCount - 1;
        return { name: 'qasm_circuit', startLine, endLine };
    }

    const inspectCurrentLineDisposable = vscode.commands.registerCommand('qsphere.inspectCurrentLine', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;

        const document = activeEditor.document;
        const isPython = document.fileName.endsWith('.py') || document.languageId === 'python';
        const isQSharp = document.fileName.endsWith('.qs') || document.languageId === 'qsharp';
        const isQasm = document.fileName.endsWith('.qasm') || document.fileName.endsWith('.openqasm') || document.languageId === 'qasm';
        if (!isPython && !isQSharp && !isQasm) return;

        const cursorLine = activeEditor.selection.active.line;

        if (isQSharp) {
            const mainOp = findMainOperation(document);
            if (!mainOp || cursorLine < mainOp.startLine || cursorLine > mainOp.endLine) {
                return;
            }

            let effectiveLine = cursorLine;
            while (effectiveLine > mainOp.startLine && document.lineAt(effectiveLine).text.trim().length === 0) {
                effectiveLine--;
            }

            const lineText = document.lineAt(effectiveLine).text.trim();
            const lineRange = document.lineAt(effectiveLine).range;
            activeEditor.setDecorations(lineHighlightDecoration, [lineRange]);

            let nextLine = cursorLine + 1;
            while (nextLine < mainOp.endLine && document.lineAt(nextLine).text.trim().length === 0) {
                nextLine++;
            }
            if (nextLine <= mainOp.endLine) {
                const nextLineEnd = document.lineAt(nextLine).range.end;
                activeEditor.selection = new vscode.Selection(nextLineEnd, nextLineEnd);
                activeEditor.revealRange(new vscode.Range(nextLineEnd, nextLineEnd), vscode.TextEditorRevealType.Default);
            }

            const payload = {
                fileName: document.fileName,
                code: document.getText(),
                targetLine: effectiveLine,
                lineText,
                targetOp: mainOp
            };

            if (!activePanel) {
                pendingInspectPayload = payload;
                vscode.commands.executeCommand('qsphere.openVisualizer', mainOp);
            } else {
                activePanel.webview.postMessage({
                    command: 'inspectLine',
                    data: payload
                });
            }
        } else if (isPython) {
            // Python / Qiskit
            const circuit = findPythonCircuit(document);
            if (!circuit || cursorLine < circuit.startLine || cursorLine > circuit.endLine) {
                return;
            }

            let effectiveLine = cursorLine;
            while (effectiveLine > circuit.startLine && document.lineAt(effectiveLine).text.trim().length === 0) {
                effectiveLine--;
            }

            const lineText = document.lineAt(effectiveLine).text.trim();
            const lineRange = document.lineAt(effectiveLine).range;
            activeEditor.setDecorations(lineHighlightDecoration, [lineRange]);

            let nextLine = cursorLine + 1;
            while (nextLine < circuit.endLine && document.lineAt(nextLine).text.trim().length === 0) {
                nextLine++;
            }
            if (nextLine <= circuit.endLine) {
                const nextLineEnd = document.lineAt(nextLine).range.end;
                activeEditor.selection = new vscode.Selection(nextLineEnd, nextLineEnd);
                activeEditor.revealRange(new vscode.Range(nextLineEnd, nextLineEnd), vscode.TextEditorRevealType.Default);
            }

            const payload = {
                fileName: document.fileName,
                code: document.getText(),
                targetLine: effectiveLine,
                lineText,
                targetOp: circuit
            };

            if (!activePanel) {
                pendingInspectPayload = payload;
                vscode.commands.executeCommand('qsphere.openVisualizer', circuit);
            } else {
                activePanel.webview.postMessage({
                    command: 'inspectLine',
                    data: payload
                });
            }
        } else if (isQasm) {
            // OpenQASM 2.0 / 3.0
            const circuit = findQasmCircuit(document);
            if (!circuit || cursorLine < circuit.startLine || cursorLine > circuit.endLine) {
                return;
            }

            let effectiveLine = cursorLine;
            while (effectiveLine > circuit.startLine && (document.lineAt(effectiveLine).text.trim().length === 0 || document.lineAt(effectiveLine).text.trim().startsWith('//'))) {
                effectiveLine--;
            }

            const lineText = document.lineAt(effectiveLine).text.trim();
            const lineRange = document.lineAt(effectiveLine).range;
            activeEditor.setDecorations(lineHighlightDecoration, [lineRange]);

            let nextLine = cursorLine + 1;
            while (nextLine < circuit.endLine && (document.lineAt(nextLine).text.trim().length === 0 || document.lineAt(nextLine).text.trim().startsWith('//'))) {
                nextLine++;
            }
            if (nextLine <= circuit.endLine) {
                const nextLineEnd = document.lineAt(nextLine).range.end;
                activeEditor.selection = new vscode.Selection(nextLineEnd, nextLineEnd);
                activeEditor.revealRange(new vscode.Range(nextLineEnd, nextLineEnd), vscode.TextEditorRevealType.Default);
            }

            const payload = {
                fileName: document.fileName,
                code: document.getText(),
                targetLine: effectiveLine,
                lineText,
                targetOp: circuit
            };

            if (!activePanel) {
                pendingInspectPayload = payload;
                vscode.commands.executeCommand('qsphere.openVisualizer', circuit);
            } else {
                activePanel.webview.postMessage({
                    command: 'inspectLine',
                    data: payload
                });
            }
        }
    });

    const replayAnimationDisposable = vscode.commands.registerCommand('qsphere.replayAnimation', () => {
        activePanel?.webview.postMessage({ command: 'replayAnimation' });
    });

    const codeLensProvider = vscode.languages.registerCodeLensProvider(
        [{ pattern: '**/*.qs' }, { language: 'qsharp' }],
        {
            provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
                if (!document.fileName.endsWith('.qs') && document.languageId !== 'qsharp') return [];
                const mainOp = findMainOperation(document);
                if (!mainOp) return [];

                return [
                    new vscode.CodeLens(new vscode.Range(mainOp.startLine, 0, mainOp.startLine, 0), {
                        title: 'State',
                        command: 'qsphere.openVisualizer',
                        arguments: [mainOp],
                        tooltip: 'Open Qsphere visualizer for Main'
                    })
                ];
            }
        }
    );

    const pythonCodeLensProvider = vscode.languages.registerCodeLensProvider(
        [{ pattern: '**/*.py' }, { language: 'python' }],
        {
            provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
                if (!document.fileName.endsWith('.py') && document.languageId !== 'python') return [];
                const circuit = findPythonCircuit(document);
                if (!circuit) return [];

                return [
                    new vscode.CodeLens(new vscode.Range(circuit.startLine, 0, circuit.startLine, 0), {
                        title: 'State',
                        command: 'qsphere.openVisualizer',
                        arguments: [circuit],
                        tooltip: 'Open StateVisualizer for Qiskit circuit'
                    })
                ];
            }
        }
    );

    const qasmCodeLensProvider = vscode.languages.registerCodeLensProvider(
        [{ pattern: '**/*.qasm' }, { pattern: '**/*.openqasm' }, { language: 'qasm' }],
        {
            provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
                const isQasm = document.fileName.endsWith('.qasm') || document.fileName.endsWith('.openqasm') || document.languageId === 'qasm';
                if (!isQasm) return [];
                const circuit = findQasmCircuit(document);
                if (!circuit) return [];

                return [
                    new vscode.CodeLens(new vscode.Range(circuit.startLine, 0, circuit.startLine, 0), {
                        title: 'State',
                        command: 'qsphere.openVisualizer',
                        arguments: [circuit],
                        tooltip: 'Open StateVisualizer for OpenQASM circuit'
                    })
                ];
            }
        }
    );

    context.subscriptions.push(
        openVisualizerDisposable,
        inspectCurrentLineDisposable,
        replayAnimationDisposable,
        codeLensProvider,
        pythonCodeLensProvider,
        qasmCodeLensProvider,
        lineHighlightDecoration
    );
}




export function deactivate() { }

function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const extRoot = context.extensionPath;

    const templatePath = path.join(extRoot, 'src', 'webview', 'index.html');
    const cssPath = path.join(extRoot, 'src', 'webview', 'styles.css');
    const katexCssPath = path.join(extRoot, 'dist', 'katex', 'katex.min.css');
    const runtimePath = path.join(extRoot, 'dist', 'qsharpRuntime.bundle.js');
    const runtimeUiPath = path.join(extRoot, 'src', 'webview', 'runtime', 'qsharpRuntimeUi.js');
    const qiskitRuntimePath = path.join(extRoot, 'dist', 'qiskitRuntime.bundle.js');
    const webviewBundlePath = path.join(extRoot, 'dist', 'webview.bundle.js');
    const wasmPath = path.join(extRoot, 'assets', 'wasm', 'qsc_wasm_bg.wasm');
    const testQsPath = path.join(extRoot, 'samples', 'test.qs');
    const template = fs.readFileSync(templatePath, 'utf8');
    const uri = (filePath: string) => webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; script-src ${webview.cspSource} 'unsafe-eval' 'wasm-unsafe-eval'; connect-src ${webview.cspSource};">`;

    return template
        .replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n    ${csp}`)
        .replace('styles.css', uri(cssPath))
        .replace('dist/katex/katex.min.css', uri(katexCssPath))
        .replace('dist/qsharpRuntime.bundle.js', uri(runtimePath))
        .replace('runtime/qsharpRuntimeUi.js', uri(runtimeUiPath))
        .replace('dist/qiskitRuntime.bundle.js', uri(qiskitRuntimePath))
        .replace('dist/webview.bundle.js', uri(webviewBundlePath))
        .replace('assets/wasm/qsc_wasm_bg.wasm', uri(wasmPath))
        .replace('samples/test.qs', uri(testQsPath));
}





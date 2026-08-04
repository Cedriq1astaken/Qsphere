import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Qsphere extension active for .qs files!');

    let activeTargetOp: { name: string, startLine: number, endLine: number } | undefined;
    let activePanel: vscode.WebviewPanel | undefined;

    const openVisualizerDisposable = vscode.commands.registerCommand('qsphere.openVisualizer', (targetOp?: { name: string, startLine: number, endLine: number }) => {
        if (targetOp) {
            activeTargetOp = targetOp;
        }

        const activeEditor = vscode.window.activeTextEditor;
        const sourceDocument = activeEditor?.document;
        const fileName = sourceDocument?.fileName || 'test.qs';
        let codeContent = sourceDocument?.getText() || '';

        if (!codeContent) {
            const testQsPath = path.join(context.extensionPath, 'src', 'test.qs');
            if (fs.existsSync(testQsPath)) codeContent = fs.readFileSync(testQsPath, 'utf8');
        }

        const titleName = activeTargetOp?.name ? `Qsphere: ${activeTargetOp.name}` : 'Qsphere Quantum Visualizer';

        const panel = vscode.window.createWebviewPanel(
            'qsphereVisualizer',
            titleName,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src'))]
            }
        );
        activePanel = panel;

        panel.webview.html = getWebviewContent(context, panel.webview);
        const postSource = (command: 'init' | 'update', code: string, sourceName: string) => {
            panel.webview.postMessage({ command, data: { fileName: sourceName, code, targetOp: activeTargetOp } });
        };

        const readyDisposable = panel.webview.onDidReceiveMessage(message => {
            if (message.command !== 'ready') return;
            const currentEditor = vscode.window.activeTextEditor;
            postSource(
                'init',
                currentEditor?.document.getText() || codeContent,
                currentEditor?.document.fileName || fileName
            );
        });

        postSource('init', codeContent, fileName);

        let updateTimer: ReturnType<typeof setTimeout> | undefined;
        const trackedUri = sourceDocument?.uri.toString();
        const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
            if (!event.document.fileName.endsWith('.qs')) return;
            if (trackedUri && event.document.uri.toString() !== trackedUri) return;
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
        });
    });

    const replayAnimationDisposable = vscode.commands.registerCommand('qsphere.replayAnimation', () => {
        activePanel?.webview.postMessage({ command: 'replayAnimation' });
    });

    const codeLensProvider = vscode.languages.registerCodeLensProvider(
        [{ pattern: '**/*.qs' }, { language: 'qsharp' }],
        {
            provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
                if (!document.fileName.endsWith('.qs') && document.languageId !== 'qsharp') return [];
                const lenses: vscode.CodeLens[] = [];
                const operationPattern = /^\s*operation\s+([A-Za-z_][A-Za-z0-9_]*)/;
                const operationRanges = new Map<string, { startLine: number, endLine: number }>();

                // First collect user-defined operation ranges. These are used to
                // recognize calls without adding lenses to the declarations.
                for (let line = 0; line < document.lineCount; line++) {
                    const match = document.lineAt(line).text.match(operationPattern);
                    if (!match) continue;
                    const opName = match[1];

                    // Determine operation brace range
                    let braceCount = 0;
                    let foundOpenBrace = false;
                    let endLine = line;
                    for (let l = line; l < document.lineCount; l++) {
                        const lineText = document.lineAt(l).text;
                        for (const char of lineText) {
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

                    operationRanges.set(opName, { startLine: line, endLine });

                    if (opName === 'Main') {
                        lenses.push(new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
                            title: 'State (Main)',
                            command: 'qsphere.openVisualizer',
                            arguments: [{ name: opName, startLine: line, endLine }],
                            tooltip: 'Click to open Qsphere visualizer for Main'
                        }));
                    }
                }

                // Add state lenses above calls to known user-defined operations.
                // Built-in gates such as H, X, and Reset are not included because
                // they do not appear in operationRanges.
                const operationCallPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
                for (let line = 0; line < document.lineCount; line++) {
                    const lineText = document.lineAt(line).text;
                    if (operationPattern.test(lineText)) continue;

                    operationCallPattern.lastIndex = 0;
                    const call = operationCallPattern.exec(lineText);
                    if (!call) continue;

                    const opName = call[1];
                    const operation = operationRanges.get(opName);
                    if (!operation) continue;

                    lenses.push(new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
                        title: `State (${opName})`,
                        command: 'qsphere.openVisualizer',
                        arguments: [{ name: opName, ...operation }],
                        tooltip: `Click to open Qsphere visualizer for this ${opName} call`
                    }));
                }
                return lenses;
            }
        }
    );
    context.subscriptions.push(openVisualizerDisposable, replayAnimationDisposable, codeLensProvider);
}

export function deactivate() {}

function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const sourceRoot = path.join(context.extensionPath, 'src');
    const templatePath = path.join(sourceRoot, 'webview.html');
    const cssPath = path.join(sourceRoot, 'webview.css');
    const runtimePath = path.join(sourceRoot, 'script', 'qsharpRuntime.bundle.js');
    const runtimeUiPath = path.join(sourceRoot, 'script', 'qsharpRuntimeUi.js');
    const jsPath = path.join(sourceRoot, 'script', 'webview.js');
    const mathJsPath = path.join(sourceRoot, 'script', 'math.js');
    const blochVectorPath = path.join(sourceRoot, 'script', 'blochVector.js');
    const qsphereVectorPath = path.join(sourceRoot, 'script', 'qsphereVector.js');
    const wasmPath = path.join(sourceRoot, 'wasm', 'qsc_wasm_bg.wasm');
    const vertexShaderPath = path.join(sourceRoot, 'shader', 'vertex.wgsl');
    const fragmentShaderPath = path.join(sourceRoot, 'shader', 'fragment.wgsl');
    const arrowShaderPath = path.join(sourceRoot, 'shader', 'fragment_arrow.wgsl');
    const linesShaderPath = path.join(sourceRoot, 'shader', 'fragment_lines.wgsl');
    const qnodesShaderPath = path.join(sourceRoot, 'shader', 'fragment_qnodes.wgsl');
    const testQsPath = path.join(sourceRoot, 'test.qs');
    const template = fs.readFileSync(templatePath, 'utf8');
    const uri = (filePath: string) => webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'wasm-unsafe-eval'; connect-src ${webview.cspSource};">`;

    return template
        .replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n    ${csp}`)
        .replace('webview.css', uri(cssPath))
        .replace('script/qsharpRuntime.bundle.js', uri(runtimePath))
        .replace('script/qsharpRuntimeUi.js', uri(runtimeUiPath))
        .replace('script/math.js', uri(mathJsPath))
        .replace('script/blochVector.js', uri(blochVectorPath))
        .replace('script/qsphereVector.js', uri(qsphereVectorPath))
        .replace('script/webview.js', uri(jsPath))
        .replace('wasm/qsc_wasm_bg.wasm', uri(wasmPath))
        .replace('shader/vertex.wgsl', uri(vertexShaderPath))
        .replace('shader/fragment.wgsl', uri(fragmentShaderPath))
        .replace('shader/fragment_arrow.wgsl', uri(arrowShaderPath))
        .replace('shader/fragment_lines.wgsl', uri(linesShaderPath))
        .replace('shader/fragment_qnodes.wgsl', uri(qnodesShaderPath))
        .replace('test.qs', uri(testQsPath));
}

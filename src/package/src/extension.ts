import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Qsphere extension active for .qs files!');

    // 1. Register Command to open Visualizer
    let openVisualizerDisposable = vscode.commands.registerCommand('qsphere.openVisualizer', () => {
        const activeEditor = vscode.window.activeTextEditor;
        const fileName = activeEditor ? activeEditor.document.fileName : 'test.qs';
        let codeContent = activeEditor ? activeEditor.document.getText() : '';

        if (!codeContent) {
            const testQsPath = path.join(context.extensionPath, 'src', 'test.qs');
            if (fs.existsSync(testQsPath)) {
                codeContent = fs.readFileSync(testQsPath, 'utf8');
            }
        }

        const panel = vscode.window.createWebviewPanel(
            'qsphereVisualizer',
            'Qsphere Quantum Visualizer',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src'))
                ]
            }
        );

        panel.webview.html = getWebviewContent(context, panel.webview);

        // Handle messages sent from the Webview (e.g. ready message on load)
        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'ready') {
                const editor = vscode.window.activeTextEditor;
                const currentCode = editor ? editor.document.getText() : codeContent;
                panel.webview.postMessage({
                    command: 'init',
                    data: {
                        qubits: 2,
                        fileName: editor ? editor.document.fileName : fileName,
                        code: currentCode
                    }
                });
            }
        });

        // Send active code file info & content to the Webview (initial attempt)
        panel.webview.postMessage({
            command: 'init',
            data: {
                qubits: 2,
                fileName: fileName,
                code: codeContent
            }
        });

        // Live-update the arrow whenever the user edits a .qs file
        const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.fileName.endsWith('.qs')) {
                panel.webview.postMessage({
                    command: 'update',
                    data: {
                        code: event.document.getText()
                    }
                });
            }
        });

        panel.onDidDispose(() => {
            changeDisposable.dispose();
        });
    });

    // 2. Register CodeLens Provider strictly for .qs (Q#) files
    const codeLensProvider = vscode.languages.registerCodeLensProvider(
        [
            { pattern: '**/*.qs' },
            { language: 'qsharp' }
        ],
        {
            provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
                // Double check file extension ends with .qs
                if (!document.fileName.endsWith('.qs') && document.languageId !== 'qsharp') {
                    return [];
                }

                const lenses: vscode.CodeLens[] = [];
                const operationPattern = /^\s*operation\s+[A-Za-z_][A-Za-z0-9_]*/;

                for (let line = 0; line < document.lineCount; line++) {
                    const lineText = document.lineAt(line).text;
                    if (!operationPattern.test(lineText)) {
                        continue;
                    }

                    const range = new vscode.Range(line, 0, line, 0);
                    lenses.push(
                        new vscode.CodeLens(range, {
                            title: 'State',
                            command: 'qsphere.openVisualizer',
                            tooltip: 'Click to open Qsphere visualizer panel for this operation'
                        })
                    );
                }

                return lenses;
            }
        }
    );

    context.subscriptions.push(openVisualizerDisposable, codeLensProvider);
}

export function deactivate() {}

function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const templatePath = path.join(context.extensionPath, 'src', 'webview.html');
    const cssPath = path.join(context.extensionPath, 'src', 'webview.css');
    const wasmParserPath = path.join(context.extensionPath, 'src', 'script', 'wasmParser.js');
    const jsPath = path.join(context.extensionPath, 'src', 'script', 'webview.js');
    const mathJsPath = path.join(context.extensionPath, 'src', 'script', 'math.js');
    const blochVectorPath = path.join(context.extensionPath, 'src', 'script', 'blochVector.js');
    const vertexShaderPath = path.join(context.extensionPath, 'src', 'shader', 'vertex.wgsl');
    const fragmentShaderPath = path.join(context.extensionPath, 'src', 'shader', 'fragment.wgsl');
    const arrowShaderPath = path.join(context.extensionPath, 'src', 'shader', 'fragment_arrow.wgsl');
    const linesShaderPath = path.join(context.extensionPath, 'src', 'shader', 'fragment_lines.wgsl');
    const qnodesShaderPath = path.join(context.extensionPath, 'src', 'shader', 'fragment_qnodes.wgsl');
    const testQsPath = path.join(context.extensionPath, 'src', 'test.qs');

    const template = fs.readFileSync(templatePath, 'utf8');
    const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath)).toString();
    const wasmParserUri = webview.asWebviewUri(vscode.Uri.file(wasmParserPath)).toString();
    const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath)).toString();
    const mathJsUri = webview.asWebviewUri(vscode.Uri.file(mathJsPath)).toString();
    const gatesUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'src', 'script', 'gates.js'))).toString();
    const blochVectorUri = webview.asWebviewUri(vscode.Uri.file(blochVectorPath)).toString();
    const qsphereVectorUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'src', 'script', 'qsphereVector.js'))).toString();
    const vertexShaderUri = webview.asWebviewUri(vscode.Uri.file(vertexShaderPath)).toString();
    const fragmentShaderUri = webview.asWebviewUri(vscode.Uri.file(fragmentShaderPath)).toString();
    const arrowShaderUri = webview.asWebviewUri(vscode.Uri.file(arrowShaderPath)).toString();
    const linesShaderUri = webview.asWebviewUri(vscode.Uri.file(linesShaderPath)).toString();
    const qnodesShaderUri = webview.asWebviewUri(vscode.Uri.file(qnodesShaderPath)).toString();
    const testQsUri = webview.asWebviewUri(vscode.Uri.file(testQsPath)).toString();
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; connect-src ${webview.cspSource};">`;

    return template
        .replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n    ${csp}`)
        .replace('webview.css', cssUri)
        .replace('script/wasmParser.js', wasmParserUri)
        .replace('script/math.js', mathJsUri)
        .replace('script/gates.js', gatesUri)
        .replace('script/blochVector.js', blochVectorUri)
        .replace('script/qsphereVector.js', qsphereVectorUri)
        .replace('script/webview.js', jsUri)
        .replace('shader/vertex.wgsl', vertexShaderUri)
        .replace('shader/fragment.wgsl', fragmentShaderUri)
        .replace('shader/fragment_arrow.wgsl', arrowShaderUri)
        .replace('shader/fragment_lines.wgsl', linesShaderUri)
        .replace('shader/fragment_qnodes.wgsl', qnodesShaderUri)
        .replace('test.qs', testQsUri);
}





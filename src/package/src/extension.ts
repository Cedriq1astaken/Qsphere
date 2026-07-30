import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('Qsphere extension active for .qs files!');

    // 1. Register Command to open Visualizer
    let openVisualizerDisposable = vscode.commands.registerCommand('qsphere.openVisualizer', () => {
        const activeEditor = vscode.window.activeTextEditor;
        const fileName = activeEditor ? activeEditor.document.fileName : 'Quantum Code';
        const codeContent = activeEditor ? activeEditor.document.getText() : '';

        const panel = vscode.window.createWebviewPanel(
            'qsphereVisualizer',
            'Qsphere Quantum Visualizer',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getWebviewContent(context, panel.webview);

        // Send active code file info & content to the Webview
        panel.webview.postMessage({
            command: 'init',
            data: {
                qubits: 2,
                fileName: fileName,
                code: codeContent
            }
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
                            title: 'Qshere',
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
    const jsPath = path.join(context.extensionPath, 'src', 'script', 'webview.js');
    const mathJsPath = path.join(context.extensionPath, 'src', 'script', 'math.js');
    const vertexShaderPath = path.join(context.extensionPath, 'src', 'shader', 'vertex.wgsl');
    const fragmentShaderPath = path.join(context.extensionPath, 'src', 'shader', 'fragment.wgsl');

    const template = fs.readFileSync(templatePath, 'utf8');
    const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath)).toString();
    const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath)).toString();
    const mathJsUri = webview.asWebviewUri(vscode.Uri.file(mathJsPath)).toString();
    const vertexShaderUri = webview.asWebviewUri(vscode.Uri.file(vertexShaderPath)).toString();
    const fragmentShaderUri = webview.asWebviewUri(vscode.Uri.file(fragmentShaderPath)).toString();
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource}; connect-src ${webview.cspSource};">`;

    return template
        .replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n    ${csp}`)
        .replace('webview.css', cssUri)
        .replace('script/math.js', mathJsUri)
        .replace('script/webview.js', jsUri)
        .replace('shader/vertex.wgsl', vertexShaderUri)
        .replace('shader/fragment.wgsl', fragmentShaderUri);
}





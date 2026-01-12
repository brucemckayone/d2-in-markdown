import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { d2Plugin } from './d2Plugin';

export function activate(context: vscode.ExtensionContext) {
    
    // Register the configuration command
    const configDisposable = vscode.commands.registerCommand('d2.configure', async () => {
        const config = vscode.workspace.getConfiguration('d2InMarkdown');
        const update = (key: string, value: any) => config.update(key, value, vscode.ConfigurationTarget.Global);

        const themes = [
            { label: 'Neutral Default', id: 0 },
            { label: 'Neutral Grey', id: 1 },
            { label: 'Flagship Terrastruct', id: 3 },
            { label: 'Cool Classics', id: 4 },
            { label: 'Mixed Berry Blue', id: 5 },
            { label: 'Grape Soda', id: 6 },
            { label: 'Aubergine', id: 7 },
            { label: 'Colorblind Clear', id: 8 },
            { label: 'Vanilla Nitro Cola', id: 100 },
            { label: 'Orange Creamsicle', id: 101 },
            { label: 'Shirley Temple', id: 102 },
            { label: 'Earth Tones', id: 103 },
            { label: 'Everglade Green', id: 104 },
            { label: 'Buttered Toast', id: 105 },
            { label: 'Dark Mauve', id: 200 },
            { label: 'Dark Flagship Terrastruct', id: 201 },
            { label: 'Terminal', id: 300 },
            { label: 'Terminal Grayscale', id: 301 },
            { label: 'Origami', id: 302 },
            { label: 'C4', id: 303 }
        ];

        const currentThemeId = config.get<number>('theme', 0);
        const currentSketch = config.get<boolean>('sketch', false);
        const currentLayout = config.get<string>('layout', 'dagre');
        const currentThemeLabel = themes.find(t => t.id === currentThemeId)?.label || `Custom (${currentThemeId})`;

        const items: vscode.QuickPickItem[] = [
            { 
                label: '$(paintcan) Change Theme', 
                description: currentThemeLabel,
                detail: 'Select visual style for diagrams'
            },
            {
                label: `$(edit) Sketch Mode: ${currentSketch ? 'ON' : 'OFF'}`, 
                description: 'Toggle hand-drawn style',
                detail: 'Click to toggle'
            },
            {
                label: '$(type-hierarchy) Change Layout Engine', 
                description: currentLayout,
                detail: 'dagre or elk'
            },
            {
                label: '$(settings-gear) Open All Settings',
                description: 'Open full settings UI'
            }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Configure D2 Renderer'
        });

        if (!selection) return;

        if (selection.label.includes('Change Theme')) {
            const themeSelection = await vscode.window.showQuickPick(
                themes.map(t => ({ label: t.label, description: `ID: ${t.id}`, id: t.id })),
                { placeHolder: 'Select a D2 Theme' }
            );
            if (themeSelection) {
                await update('theme', themeSelection.id);
                vscode.window.showInformationMessage(`D2 Theme set to ${themeSelection.label}`);
                vscode.commands.executeCommand('markdown.preview.refresh'); // Force refresh
            }
        } 
        else if (selection.label.includes('Sketch Mode')) {
            await update('sketch', !currentSketch);
            vscode.window.showInformationMessage(`D2 Sketch Mode turned ${!currentSketch ? 'ON' : 'OFF'}`);
            vscode.commands.executeCommand('markdown.preview.refresh'); // Force refresh
        }
        else if (selection.label.includes('Change Layout')) {
            const layoutSelection = await vscode.window.showQuickPick(['dagre', 'elk'], { placeHolder: 'Select Layout Engine' });
            if (layoutSelection) {
                await update('layout', layoutSelection);
                vscode.window.showInformationMessage(`D2 Layout set to ${layoutSelection}`);
                vscode.commands.executeCommand('markdown.preview.refresh'); // Force refresh
            }
        }
        else if (selection.label.includes('Open All Settings')) {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:brucemckay.d2-in-markdown');
        }
    });

    // Command: Format Block
    const formatDisposable = vscode.commands.registerCommand('d2.formatBlock', async (range: vscode.Range) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const text = editor.document.getText(range);
        try {
            const result = cp.spawnSync('d2', ['fmt', '-'], { input: text, encoding: 'utf-8' });
            if (result.status === 0 && result.stdout) {
                await editor.edit(editBuilder => {
                    editBuilder.replace(range, result.stdout.trim());
                });
            } else {
                vscode.window.showErrorMessage(`D2 Format Failed: ${result.stderr}`);
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`D2 Format Error: ${e.message}`);
        }
    });

    // Command: Copy SVG
    const copySvgDisposable = vscode.commands.registerCommand('d2.copySvg', async (code: string) => {
        try {
            // Check for import
            const importMatch = code.match(/^\s*@import\s+["'](.+)["']\s*$/);
            let d2Args = ['-'];
            let input = code;

            if (importMatch && vscode.window.activeTextEditor) {
                const docPath = vscode.window.activeTextEditor.document.uri.fsPath;
                const resolvedPath = path.join(path.dirname(docPath), importMatch[1]);
                d2Args = [resolvedPath, '-'];
                input = '';
            }

            const result = cp.spawnSync('d2', d2Args, { input: input || undefined, encoding: 'utf-8' });
            if (result.status === 0) {
                await vscode.env.clipboard.writeText(result.stdout);
                vscode.window.showInformationMessage('SVG copied to clipboard');
            } else {
                vscode.window.showErrorMessage(`D2 Export Failed: ${result.stderr}`);
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`D2 Export Error: ${e.message}`);
        }
    });

    // Command: Open Playground
    const playgroundDisposable = vscode.commands.registerCommand('d2.openPlayground', (code: string) => {
        const encoded = Buffer.from(code).toString('base64');
        const url = `https://play.d2lang.com/?script=${encodeURIComponent(encoded)}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
    });

    // CodeLens Provider
    const codeLensProvider = vscode.languages.registerCodeLensProvider({ language: 'markdown' }, {
        provideCodeLenses(document: vscode.TextDocument) {
            const lenses: vscode.CodeLens[] = [];
            const text = document.getText();
            const re = /```d2\s*([\s\S]*?)```/g;
            let match;

            while ((match = re.exec(text)) !== null) {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const range = new vscode.Range(startPos, endPos);
                
                // Block content range (excluding backticks)
                const contentStart = document.positionAt(match.index + match[0].indexOf('\n') + 1);
                const contentEnd = document.positionAt(match.index + match[0].lastIndexOf('\n'));
                const contentRange = new vscode.Range(contentStart, contentEnd);
                const code = match[1].trim();

                lenses.push(
                    new vscode.CodeLens(range, {
                        title: '$(pencil) Format',
                        command: 'd2.formatBlock',
                        arguments: [contentRange]
                    }),
                    new vscode.CodeLens(range, {
                        title: '$(clippy) Copy SVG',
                        command: 'd2.copySvg',
                        arguments: [code]
                    }),
                    new vscode.CodeLens(range, {
                        title: '$(link-external) Playground',
                        command: 'd2.openPlayground',
                        arguments: [code]
                    })
                );
            }
            return lenses;
        }
    });

    context.subscriptions.push(configDisposable, formatDisposable, copySvgDisposable, playgroundDisposable, codeLensProvider);

    return {
        extendMarkdownIt(md: any) {
            return md.use(d2Plugin);
        }
    };
}

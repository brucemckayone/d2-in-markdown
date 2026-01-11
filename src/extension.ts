import * as vscode from 'vscode';
import { d2Plugin } from './d2Plugin';

export function activate(context: vscode.ExtensionContext) {
    
    // Register the configuration command
    const disposable = vscode.commands.registerCommand('d2.configure', async () => {
        const config = vscode.workspace.getConfiguration('d2InMarkdown');
        
        // Helper to update config
        const update = (key: string, value: any) => config.update(key, value, vscode.ConfigurationTarget.Global);

        // Define themes (Based on d2 themes output)
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

        // Create main menu items
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

    context.subscriptions.push(disposable);

    return {
        extendMarkdownIt(md: any) {
            return md.use(d2Plugin);
        }
    };
}
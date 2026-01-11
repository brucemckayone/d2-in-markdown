import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export function d2Plugin(md: any) {
    // Add a core rule to hijack d2 tokens and render them IMMEDIATELY
    // We replace the fence token with an html_block token containing the SVG
    md.core.ruler.push('d2_hijack_render', (state: any) => {
        // Iterate tokens to find d2 fences
        for (let i = 0; i < state.tokens.length; i++) {
            const t = state.tokens[i];
            if (t.type === 'fence') {
                const info = t.info ? t.info.trim().toLowerCase() : '';
                const lang = info.split(/\s+/)[0];
                if (lang === 'd2' || info.includes('d2')) {
                    
                    try {
                        const code = t.content.trim();
                        // Check for import syntax
                        const importMatch = code.match(/^\s*@import\s+["'](.+)["']\s*$/);
                        let d2Args = ['-'];
                        let input = code;
                        let cwd = process.cwd(); // Default

                        // Attempt to resolve CWD from workspace
                        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                            cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
                        }

                        // Attempt to resolve CWD from current document (more specific)
                        if (state.env && state.env.currentDocument) {
                            const docPath = state.env.currentDocument.fsPath || state.env.currentDocument.path;
                            if (docPath) {
                                cwd = path.dirname(docPath);
                            }
                        }

                        if (importMatch) {
                            const importPath = importMatch[1];
                            const resolvedPath = path.resolve(cwd, importPath);
                            if (fs.existsSync(resolvedPath)) {
                                d2Args = [resolvedPath, '-'];
                                input = '';
                            } else {
                                const errToken = new state.Token('html_block', '', 0);
                                errToken.content = `<div style="color: red; border: 1px solid red; padding: 10px;"><strong>D2 Error:</strong> File not found: ${resolvedPath}</div>`;
                                state.tokens[i] = errToken;
                                continue;
                            }
                        }

                        // Read configuration
                        const config = vscode.workspace.getConfiguration('d2InMarkdown');
                        const theme = config.get<number>('theme', 0);
                        const darkTheme = config.get<number>('darkTheme', -1);
                        const layout = config.get<string>('layout', 'dagre');
                        const sketch = config.get<boolean>('sketch', false);
                        const pad = config.get<number>('pad', 100);
                        const scale = config.get<number>('scale', -1);

                        // Add flags
                        d2Args.push(`--theme=${theme}`);
                        if (darkTheme !== -1) {
                            d2Args.push(`--dark-theme=${darkTheme}`);
                        }
                        d2Args.push(`--layout=${layout}`);
                        if (sketch) {
                            d2Args.push('--sketch');
                        }
                        d2Args.push(`--pad=${pad}`);
                        if (scale !== -1) {
                             d2Args.push(`--scale=${scale}`);
                        }

                        const result = cp.spawnSync('d2', d2Args, {
                            input: input ? input : undefined,
                            cwd: cwd,
                            encoding: 'utf-8'
                        });

                        // Create a NEW html_block token
                        const newToken = new state.Token('html_block', '', 0);
                        
                        if (result.error) {
                             newToken.content = `<div style="color: red; border: 1px solid red; padding: 10px;"><strong>D2 Execution Failed:</strong> ${result.error.message}</div>`;
                        } else if (result.status !== 0) {
                            newToken.content = `<div style="color: red; border: 1px solid red; padding: 10px;"><strong>D2 Error:</strong><pre>${result.stderr}</pre></div>`;
                        } else {
                            newToken.content = `<div class="d2-diagram">${result.stdout}</div>`;
                        }
                        
                        // Replace the fence token with our HTML token
                        state.tokens[i] = newToken;

                    } catch (e: any) {
                        const errToken = new state.Token('html_block', '', 0);
                        errToken.content = `<div style="color: red; border: 1px solid red; padding: 10px;"><strong>Plugin Error:</strong> ${e.message}</div>`;
                        state.tokens[i] = errToken;
                    }
                }
            }
        }
    });
}
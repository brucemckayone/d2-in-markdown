import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export function d2Plugin(md: any) {
    md.core.ruler.push("d2_hijack_render", (state: any) => {
        for (let i = 0; i < state.tokens.length; i++) {
            const t = state.tokens[i];
            if (t.type === "fence") {
                const info = t.info ? t.info.trim().toLowerCase() : "";
                const lang = info.split(/\s+/)[0];
                if (lang === "d2" || info.includes("d2")) {
                    try {
                        const code = t.content.trim();
                        // Check for import syntax
                        const importMatch = code.match(
                            /^\s*@import\s+["'](.+)["']\s*$/,
                        );
                        let d2Args = ["-"];
                        let input = code;
                        let cwd = process.cwd(); // Default

                        // Attempt to resolve CWD from workspace
                        if (
                            vscode.workspace.workspaceFolders &&
                            vscode.workspace.workspaceFolders.length > 0
                        ) {
                            cwd =
                                vscode.workspace.workspaceFolders[0].uri.fsPath;
                        }

                        // Attempt to resolve CWD from current document (more specific)
                        if (state.env?.currentDocument) {
                            const docPath =
                                state.env.currentDocument.fsPath ||
                                state.env.currentDocument.path;
                            if (docPath) {
                                cwd = path.dirname(docPath);
                            }
                        }
                        // Fallback: use active editor's document directory
                        else if (vscode.window.activeTextEditor) {
                            const editorPath =
                                vscode.window.activeTextEditor.document.uri
                                    .fsPath;
                            if (
                                editorPath &&
                                fs.existsSync(path.dirname(editorPath))
                            ) {
                                cwd = path.dirname(editorPath);
                            }
                        }

                        if (importMatch) {
                            const importPath = importMatch[1];
                            const resolvedPath = path.resolve(cwd, importPath);
                            if (fs.existsSync(resolvedPath)) {
                                d2Args = [resolvedPath, "-"];
                                input = "";
                            } else {
                                const errToken = new state.Token(
                                    "html_block",
                                    "",
                                    0,
                                );
                                const errMsg = `File not found: ${resolvedPath}`;
                                errToken.content = `<div class="d2-error"><strong>D2 Error:</strong> ${errMsg}<button class="d2-copy-error-btn" data-error="${errMsg.replace(/"/g, "&quot;")}" title="Copy error to clipboard">Copy</button></div>`;
                                state.tokens[i] = errToken;
                                continue;
                            }
                        }

                        // Read configuration
                        const config =
                            vscode.workspace.getConfiguration("d2InMarkdown");
                        const autoTheme = config.get<boolean>("autoTheme", true);
                        const theme = config.get<number>("theme", 0);
                        const darkTheme = config.get<number>("darkTheme", -1);
                        const layout = config.get<string>("layout", "dagre");
                        const sketch = config.get<boolean>("sketch", false);
                        const pad = config.get<number>("pad", 100);
                        const scale = config.get<number>("scale", -1);

                        // Add flags
                        d2Args.push(`--theme=${theme}`);
                        if (darkTheme !== -1) {
                            d2Args.push(`--dark-theme=${darkTheme}`);
                        }
                        d2Args.push(`--layout=${layout}`);
                        if (sketch) {
                            d2Args.push("--sketch");
                        }
                        d2Args.push(`--pad=${pad}`);
                        if (scale !== -1) {
                            d2Args.push(`--scale=${scale}`);
                        }

                        const result = cp.spawnSync("d2", d2Args, {
                            input: input ? input : undefined,
                            cwd: cwd,
                            encoding: "utf-8",
                        });

                        const newToken = new state.Token("html_block", "", 0);

                        if (result.error) {
                            const errMsg = result.error.message;
                            newToken.content = `<div class="d2-error"><strong>D2 Execution Failed:</strong> ${errMsg}<button class="d2-copy-error-btn" data-error="${errMsg.replace(/"/g, "&quot;")}" title="Copy error to clipboard">Copy</button></div>`;
                        } else if (result.status !== 0) {
                            const stderrText = result.stderr || "";
                            newToken.content = `<div class="d2-error"><strong>D2 Error:</strong><pre>${stderrText}</pre><button class="d2-copy-error-btn" data-error="${stderrText.replace(/"/g, "&quot;").replace(/\n/g, "&#10;")}" title="Copy error to clipboard">Copy</button></div>`;
                        } else {
                            const wrapperClass = autoTheme ? "d2-diagram d2-auto-theme" : "d2-diagram";
                            newToken.content = `<div class="${wrapperClass}" data-d2-layout="${layout}">${result.stdout}</div>`;
                        }

                        state.tokens[i] = newToken;
                    } catch (e: any) {
                        const errToken = new state.Token("html_block", "", 0);
                        const pluginErr = e.message;
                        errToken.content = `<div class="d2-error"><strong>Plugin Error:</strong> ${pluginErr}<button class="d2-copy-error-btn" data-error="${pluginErr.replace(/"/g, "&quot;")}" title="Copy error to clipboard">Copy</button></div>`;
                        state.tokens[i] = errToken;
                    }
                }
            }
        }
    });
}

import * as cp from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";
import { d2Plugin } from "./d2Plugin";
import { updateDiagnostics } from "./diagnostics";
import { D2PreviewPanel } from "./previewPanel";

/**
 * Extract all D2 code blocks from a markdown document.
 * Returns an array of trimmed block contents.
 */
function getD2Blocks(document: vscode.TextDocument): string[] {
    const text = document.getText();
    const re = /```d2\s*([\s\S]*?)```/g;
    const blocks: string[] = [];
    let match: RegExpExecArray | null = re.exec(text);
    while (match !== null) {
        blocks.push(match[1].trim());
        match = re.exec(text);
    }
    return blocks;
}

export function activate(context: vscode.ExtensionContext) {
    // Register the configuration command
    const configDisposable = vscode.commands.registerCommand(
        "d2.configure",
        async () => {
            const config = vscode.workspace.getConfiguration("d2InMarkdown");
            const update = (key: string, value: any) =>
                config.update(key, value, vscode.ConfigurationTarget.Global);

            const themes = [
                { label: "Neutral Default", id: 0 },
                { label: "Neutral Grey", id: 1 },
                { label: "Flagship Terrastruct", id: 3 },
                { label: "Cool Classics", id: 4 },
                { label: "Mixed Berry Blue", id: 5 },
                { label: "Grape Soda", id: 6 },
                { label: "Aubergine", id: 7 },
                { label: "Colorblind Clear", id: 8 },
                { label: "Vanilla Nitro Cola", id: 100 },
                { label: "Orange Creamsicle", id: 101 },
                { label: "Shirley Temple", id: 102 },
                { label: "Earth Tones", id: 103 },
                { label: "Everglade Green", id: 104 },
                { label: "Buttered Toast", id: 105 },
                { label: "Dark Mauve", id: 200 },
                { label: "Dark Flagship Terrastruct", id: 201 },
                { label: "Terminal", id: 300 },
                { label: "Terminal Grayscale", id: 301 },
                { label: "Origami", id: 302 },
                { label: "C4", id: 303 },
            ];

            const currentThemeId = config.get<number>("theme", 0);
            const currentSketch = config.get<boolean>("sketch", false);
            const currentLayout = config.get<string>("layout", "dagre");
            const currentAutoTheme = config.get<boolean>("autoTheme", true);
            const currentThemeLabel =
                themes.find((t) => t.id === currentThemeId)?.label ||
                `Custom (${currentThemeId})`;

            const items: vscode.QuickPickItem[] = [
                {
                    label: "$(paintcan) Change Theme",
                    description: currentThemeLabel,
                    detail: "Select visual style for diagrams",
                },
                {
                    label: `$(edit) Sketch Mode: ${currentSketch ? "ON" : "OFF"}`,
                    description: "Toggle hand-drawn style",
                    detail: "Click to toggle",
                },
                {
                    label: "$(type-hierarchy) Change Layout Engine",
                    description: currentLayout,
                    detail: "dagre or elk",
                },
                {
                    label: `$(color-mode) Auto-Theme: ${currentAutoTheme ? "ON" : "OFF"}`,
                    description: "Match diagram colors to VS Code theme",
                    detail: "Click to toggle",
                },
                {
                    label: "$(settings-gear) Open All Settings",
                    description: "Open full settings UI",
                },
            ];

            const selection = await vscode.window.showQuickPick(items, {
                placeHolder: "Configure D2 Renderer",
            });

            if (!selection) return;

            if (selection.label.includes("Change Theme")) {
                const themeSelection = await vscode.window.showQuickPick(
                    themes.map((t) => ({
                        label: t.label,
                        description: `ID: ${t.id}`,
                        id: t.id,
                    })),
                    { placeHolder: "Select a D2 Theme" },
                );
                if (themeSelection) {
                    await update("theme", themeSelection.id);
                    vscode.window.showInformationMessage(
                        `D2 Theme set to ${themeSelection.label}`,
                    );
                    vscode.commands.executeCommand("markdown.preview.refresh"); // Force refresh
                }
            } else if (selection.label.includes("Sketch Mode")) {
                await update("sketch", !currentSketch);
                vscode.window.showInformationMessage(
                    `D2 Sketch Mode turned ${!currentSketch ? "ON" : "OFF"}`,
                );
                vscode.commands.executeCommand("markdown.preview.refresh"); // Force refresh
            } else if (selection.label.includes("Change Layout")) {
                const layoutSelection = await vscode.window.showQuickPick(
                    ["dagre", "elk"],
                    { placeHolder: "Select Layout Engine" },
                );
                if (layoutSelection) {
                    await update("layout", layoutSelection);
                    vscode.window.showInformationMessage(
                        `D2 Layout set to ${layoutSelection}`,
                    );
                    vscode.commands.executeCommand("markdown.preview.refresh"); // Force refresh
                }
            } else if (selection.label.includes("Auto-Theme")) {
                await update("autoTheme", !currentAutoTheme);
                vscode.window.showInformationMessage(
                    `D2 Auto-Theme turned ${!currentAutoTheme ? "ON" : "OFF"}`,
                );
                vscode.commands.executeCommand("markdown.preview.refresh");
            } else if (selection.label.includes("Open All Settings")) {
                vscode.commands.executeCommand(
                    "workbench.action.openSettings",
                    "@ext:brucemckay.d2-in-markdown",
                );
            }
        },
    );

    // Command: Format Block
    const formatDisposable = vscode.commands.registerCommand(
        "d2.formatBlock",
        async (range: vscode.Range) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const text = editor.document.getText(range);
            try {
                const result = cp.spawnSync("d2", ["fmt", "-"], {
                    input: text,
                    encoding: "utf-8",
                });
                if (result.status === 0 && result.stdout) {
                    await editor.edit((editBuilder) => {
                        editBuilder.replace(range, result.stdout.trim());
                    });
                } else {
                    vscode.window.showErrorMessage(
                        `D2 Format Failed: ${result.stderr}`,
                    );
                }
            } catch (e: any) {
                vscode.window.showErrorMessage(`D2 Format Error: ${e.message}`);
            }
        },
    );

    // Command: Export Diagram
    const exportDisposable = vscode.commands.registerCommand(
        "d2.exportDiagram",
        async (code: string) => {
            const exportOptions: vscode.QuickPickItem[] = [
                {
                    label: "$(clippy) Copy SVG to Clipboard",
                    description: "Copy the rendered SVG markup",
                },
                {
                    label: "$(file-media) Save as SVG",
                    description: "Export diagram to an SVG file",
                },
                {
                    label: "$(file-media) Save as PNG",
                    description: "Export diagram to a PNG file",
                },
                {
                    label: "$(file-pdf) Save as PDF",
                    description: "Export diagram to a PDF file",
                },
            ];

            const selection = await vscode.window.showQuickPick(exportOptions, {
                placeHolder: "Select export format",
            });
            if (!selection) return;

            try {
                // Resolve @import if present
                const importMatch = code.match(
                    /^\s*@import\s+["'](.+)["']\s*$/,
                );
                let inputSource: string | undefined = code;
                let importFilePath: string | undefined;

                if (importMatch && vscode.window.activeTextEditor) {
                    const docPath =
                        vscode.window.activeTextEditor.document.uri.fsPath;
                    importFilePath = path.join(
                        path.dirname(docPath),
                        importMatch[1],
                    );
                    inputSource = undefined;
                }

                // Read config flags (same as d2Plugin.ts)
                const cfg = vscode.workspace.getConfiguration("d2InMarkdown");
                const theme = cfg.get<number>("theme", 0);
                const darkTheme = cfg.get<number>("darkTheme", -1);
                const layout = cfg.get<string>("layout", "dagre");
                const sketch = cfg.get<boolean>("sketch", false);
                const pad = cfg.get<number>("pad", 100);
                const scale = cfg.get<number>("scale", -1);

                const configFlags: string[] = [
                    `--theme=${theme}`,
                    `--layout=${layout}`,
                    `--pad=${pad}`,
                ];
                if (darkTheme !== -1) {
                    configFlags.push(`--dark-theme=${darkTheme}`);
                }
                if (sketch) {
                    configFlags.push("--sketch");
                }
                if (scale !== -1) {
                    configFlags.push(`--scale=${scale}`);
                }

                // Handle "Copy SVG to Clipboard"
                if (selection.label.includes("Copy SVG to Clipboard")) {
                    const d2Args = importFilePath
                        ? [importFilePath, "-", ...configFlags]
                        : ["-", ...configFlags];

                    const result = cp.spawnSync("d2", d2Args, {
                        input: inputSource,
                        encoding: "utf-8",
                    });

                    if (result.error) {
                        vscode.window.showErrorMessage(
                            `D2 Export Error: ${result.error.message}`,
                        );
                        return;
                    }
                    if (result.status !== 0) {
                        vscode.window.showErrorMessage(
                            `D2 Export Failed: ${result.stderr}`,
                        );
                        return;
                    }

                    await vscode.env.clipboard.writeText(result.stdout);
                    vscode.window.showInformationMessage(
                        "SVG copied to clipboard",
                    );
                    return;
                }

                // Determine file extension and filter for save dialog
                let ext: string;
                let filterLabel: string;
                if (selection.label.includes("Save as PNG")) {
                    ext = "png";
                    filterLabel = "PNG Image";
                } else if (selection.label.includes("Save as PDF")) {
                    ext = "pdf";
                    filterLabel = "PDF Document";
                } else {
                    ext = "svg";
                    filterLabel = "SVG Image";
                }

                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(`diagram.${ext}`),
                    filters: { [filterLabel]: [ext] },
                });
                if (!saveUri) return;

                const outputPath = saveUri.fsPath;
                const d2Args = importFilePath
                    ? [importFilePath, outputPath, ...configFlags]
                    : ["-", outputPath, ...configFlags];

                const result = cp.spawnSync("d2", d2Args, {
                    input: inputSource,
                    encoding: "utf-8",
                });

                if (result.error) {
                    vscode.window.showErrorMessage(
                        `D2 Export Error: ${result.error.message}`,
                    );
                    return;
                }
                if (result.status !== 0) {
                    vscode.window.showErrorMessage(
                        `D2 Export Failed: ${result.stderr}`,
                    );
                    return;
                }

                vscode.window.showInformationMessage(
                    `Diagram exported to ${outputPath}`,
                );
            } catch (e: any) {
                vscode.window.showErrorMessage(`D2 Export Error: ${e.message}`);
            }
        },
    );

    // Command: Open Playground
    const playgroundDisposable = vscode.commands.registerCommand(
        "d2.openPlayground",
        (code: string) => {
            const encoded = Buffer.from(code).toString("base64");
            const url = `https://play.d2lang.com/?script=${encodeURIComponent(encoded)}`;
            vscode.env.openExternal(vscode.Uri.parse(url));
        },
    );

    // Command: Copy Error
    const copyErrorDisposable = vscode.commands.registerCommand(
        "d2.copyError",
        async (code: string) => {
            try {
                const importMatch = code.match(
                    /^\s*@import\s+["'](.+)["']\s*$/,
                );
                let d2Args = ["--dry-run", "-"];
                let input: string | undefined = code;

                if (importMatch && vscode.window.activeTextEditor) {
                    const docPath =
                        vscode.window.activeTextEditor.document.uri.fsPath;
                    const resolvedPath = path.join(
                        path.dirname(docPath),
                        importMatch[1],
                    );
                    d2Args = ["--dry-run", resolvedPath, "-"];
                    input = undefined;
                }

                const result = cp.spawnSync("d2", d2Args, {
                    input,
                    encoding: "utf-8",
                    timeout: 10000,
                });

                if (result.stderr && result.stderr.trim().length > 0) {
                    await vscode.env.clipboard.writeText(result.stderr.trim());
                    vscode.window.showInformationMessage(
                        "D2 error copied to clipboard",
                    );
                } else {
                    vscode.window.showInformationMessage(
                        "No D2 errors found in this block",
                    );
                }
            } catch (e: any) {
                vscode.window.showErrorMessage(
                    `D2 Copy Error failed: ${e.message}`,
                );
            }
        },
    );

    // Command: Open Live Preview
    let previewPanel: D2PreviewPanel | undefined;
    let previewBlockIndex = -1;
    let previewDocUri: vscode.Uri | undefined;
    let previewDebounceTimer: ReturnType<typeof setTimeout> | undefined;

    function refreshPreviewFromDoc(): void {
        if (
            !previewPanel ||
            previewPanel.isDisposed() ||
            previewBlockIndex < 0 ||
            !previewDocUri
        ) {
            return;
        }
        const doc = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === previewDocUri?.toString(),
        );
        if (!doc) return;
        let code: string | undefined;
        if (doc.languageId === "d2") {
            code = doc.getText().trim() || undefined;
        } else {
            const blocks = getD2Blocks(doc);
            code =
                previewBlockIndex < blocks.length
                    ? blocks[previewBlockIndex]
                    : undefined;
        }
        previewPanel.update(code, doc.uri);
    }

    const previewDisposable = vscode.commands.registerCommand(
        "d2.openPreview",
        (...args: any[]) => {
            const code: string | undefined = args[0] ?? undefined;
            const blockIdx: number = typeof args[1] === "number" ? args[1] : 0;
            const editor = vscode.window.activeTextEditor;

            // Resolve code: use argument from CodeLens, or fall back to document content
            let resolvedCode = code;
            let resolvedIndex = blockIdx;
            if (resolvedCode === undefined && editor) {
                if (editor.document.languageId === "markdown") {
                    const blocks = getD2Blocks(editor.document);
                    if (blocks.length > 0) {
                        resolvedCode = blocks[0];
                        resolvedIndex = 0;
                    }
                } else if (editor.document.languageId === "d2") {
                    resolvedCode = editor.document.getText().trim();
                    resolvedIndex = 0;
                }
            }

            previewPanel = D2PreviewPanel.createOrShow(context.extensionUri);
            previewPanel.onDidDispose(() => {
                previewPanel = undefined;
                previewBlockIndex = -1;
                previewDocUri = undefined;
            });
            previewBlockIndex = resolvedIndex;
            previewDocUri = editor?.document.uri;
            previewPanel.update(resolvedCode, previewDocUri);
        },
    );

    const onDocChangeForPreviewDisposable =
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (
                !previewPanel ||
                previewPanel.isDisposed() ||
                (event.document.languageId !== "markdown" && event.document.languageId !== "d2") ||
                event.document.uri.toString() !== previewDocUri?.toString()
            ) {
                return;
            }
            if (previewDebounceTimer !== undefined) {
                clearTimeout(previewDebounceTimer);
            }
            previewDebounceTimer = setTimeout(() => {
                previewDebounceTimer = undefined;
                refreshPreviewFromDoc();
            }, 500);
        });

    // --- Inline Diagnostics ---
    const diagnosticCollection =
        vscode.languages.createDiagnosticCollection("d2");

    // CodeLens Provider for .d2 files
    const d2CodeLensProvider = vscode.languages.registerCodeLensProvider(
        { language: "d2" },
        {
            provideCodeLenses(document: vscode.TextDocument) {
                const lenses: vscode.CodeLens[] = [];
                const range = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(0),
                );
                const code = document.getText().trim();

                lenses.push(
                    new vscode.CodeLens(range, {
                        title: "$(open-preview) Preview",
                        command: "d2.openPreview",
                        arguments: [code, 0],
                    }),
                    new vscode.CodeLens(range, {
                        title: "$(export) Export",
                        command: "d2.exportDiagram",
                        arguments: [code],
                    }),
                    new vscode.CodeLens(range, {
                        title: "$(link-external) Playground",
                        command: "d2.openPlayground",
                        arguments: [code],
                    }),
                );
                return lenses;
            },
        },
    );

    // CodeLens Provider for Markdown
    const codeLensProvider = vscode.languages.registerCodeLensProvider(
        { language: "markdown" },
        {
            provideCodeLenses(document: vscode.TextDocument) {
                const lenses: vscode.CodeLens[] = [];
                const text = document.getText();
                const re = /```d2\s*([\s\S]*?)```/g;
                let match: RegExpExecArray | null = re.exec(text);
                let blockIndex = 0;

                // Check for existing diagnostics to show copy error button
                const docDiagnostics =
                    diagnosticCollection.get(document.uri) ?? [];

                while (match !== null) {
                    const startPos = document.positionAt(match.index);
                    const endPos = document.positionAt(
                        match.index + match[0].length,
                    );
                    const range = new vscode.Range(startPos, endPos);

                    // Block content range (excluding backticks)
                    const contentStart = document.positionAt(
                        match.index + match[0].indexOf("\n") + 1,
                    );
                    const contentEnd = document.positionAt(
                        match.index + match[0].lastIndexOf("\n"),
                    );
                    const contentRange = new vscode.Range(
                        contentStart,
                        contentEnd,
                    );
                    const code = match[1].trim();

                    lenses.push(
                        new vscode.CodeLens(range, {
                            title: "$(pencil) Format",
                            command: "d2.formatBlock",
                            arguments: [contentRange],
                        }),
                        new vscode.CodeLens(range, {
                            title: "$(export) Export",
                            command: "d2.exportDiagram",
                            arguments: [code],
                        }),
                        new vscode.CodeLens(range, {
                            title: "$(link-external) Playground",
                            command: "d2.openPlayground",
                            arguments: [code],
                        }),
                        new vscode.CodeLens(range, {
                            title: "$(open-preview) Preview",
                            command: "d2.openPreview",
                            arguments: [code, blockIndex],
                        }),
                    );

                    // Show "Copy Error" lens if this block has diagnostics
                    const blockHasErrors = docDiagnostics.some((d) =>
                        range.contains(d.range),
                    );
                    if (blockHasErrors) {
                        lenses.push(
                            new vscode.CodeLens(range, {
                                title: "$(error) Copy Error",
                                command: "d2.copyError",
                                arguments: [code],
                            }),
                        );
                    }

                    blockIndex++;
                    match = re.exec(text);
                }
                return lenses;
            },
        },
    );

    // Run diagnostics on open
    const onOpenDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
        updateDiagnostics(doc, diagnosticCollection);
    });

    // Run diagnostics on save
    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
        updateDiagnostics(doc, diagnosticCollection);
    });

    // Debounced diagnostics on change
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument(
        (event) => {
            const uri = event.document.uri.toString();
            const existing = debounceTimers.get(uri);
            if (existing !== undefined) {
                clearTimeout(existing);
            }
            debounceTimers.set(
                uri,
                setTimeout(() => {
                    debounceTimers.delete(uri);
                    updateDiagnostics(event.document, diagnosticCollection);
                }, 400),
            );
        },
    );

    // Clear diagnostics when a document is closed
    const onCloseDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
        diagnosticCollection.delete(doc.uri);
        debounceTimers.delete(doc.uri.toString());
    });

    // Run diagnostics for any already-open markdown documents
    for (const doc of vscode.workspace.textDocuments) {
        updateDiagnostics(doc, diagnosticCollection);
    }

    context.subscriptions.push(
        configDisposable,
        formatDisposable,
        exportDisposable,
        copyErrorDisposable,
        playgroundDisposable,
        previewDisposable,
        onDocChangeForPreviewDisposable,
        codeLensProvider,
        d2CodeLensProvider,
        diagnosticCollection,
        onOpenDisposable,
        onSaveDisposable,
        onChangeDisposable,
        onCloseDisposable,
    );

    return {
        extendMarkdownIt(md: any) {
            return md.use(d2Plugin);
        },
    };
}

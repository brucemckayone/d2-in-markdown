import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

/** Regex matching ```d2 fenced code blocks in Markdown. */
const D2_BLOCK_RE = /```d2\s*([\s\S]*?)```/g;

/**
 * Regex matching D2 CLI error lines.
 * D2 errors typically look like:
 *   err: <path>:<line>:<col>: <message>
 *   err: <path>:<line>:<col>-<endCol>: <message>
 *   <path>.d2:<line>:<col>: <message>
 * When reading from stdin the path is "d2" or "-".
 */
const D2_ERROR_LINE_RE =
    /(?:^|\n)\s*(?:err:\s*)?(?:[^:\s]+):(\d+):(\d+)(?:-(\d+))?:\s*(.+)/g;

interface D2Block {
    /** The trimmed D2 source code inside the fenced block. */
    code: string;
    /** 0-based line number in the document where the code content starts (line after ```d2). */
    contentStartLine: number;
    /** The full match offset (used only for ordering). */
    matchIndex: number;
}

/**
 * Find all ```d2 code blocks in a Markdown document.
 */
function findD2Blocks(document: vscode.TextDocument): D2Block[] {
    const text = document.getText();
    const blocks: D2Block[] = [];
    const re = new RegExp(D2_BLOCK_RE.source, D2_BLOCK_RE.flags);
    let match = re.exec(text);

    while (match !== null) {
        const fullMatch = match[0];
        const firstNewline = fullMatch.indexOf("\n");
        const contentStartOffset = match.index + firstNewline + 1;
        const contentStartLine = document.positionAt(contentStartOffset).line;
        const code = match[1].trim();

        blocks.push({
            code,
            contentStartLine,
            matchIndex: match.index,
        });

        match = re.exec(text);
    }

    return blocks;
}

/**
 * Parse D2 CLI stderr output and produce VS Code diagnostics, mapping
 * D2-reported line numbers back to positions in the Markdown document.
 */
function parseDiagnostics(
    stderr: string,
    contentStartLine: number,
    document: vscode.TextDocument,
): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const re = new RegExp(D2_ERROR_LINE_RE.source, D2_ERROR_LINE_RE.flags);
    let match = re.exec(stderr);

    while (match !== null) {
        const d2Line = Number.parseInt(match[1], 10); // 1-based
        const d2Col = Number.parseInt(match[2], 10); // 1-based
        const d2EndCol = match[3] ? Number.parseInt(match[3], 10) : undefined;
        const message = match[4].trim();

        // Map D2 line (1-based) back to the document line
        const docLine = contentStartLine + d2Line - 1;

        if (docLine >= 0 && docLine < document.lineCount) {
            const lineText = document.lineAt(docLine).text;
            const startCol = Math.max(0, d2Col - 1);
            const endCol =
                d2EndCol !== undefined
                    ? Math.min(lineText.length, d2EndCol)
                    : lineText.length;

            const range = new vscode.Range(docLine, startCol, docLine, endCol);

            const diagnostic = new vscode.Diagnostic(
                range,
                message,
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = "d2";
            diagnostics.push(diagnostic);
        }

        match = re.exec(stderr);
    }

    // If stderr is non-empty but we could not parse any structured error,
    // produce a single diagnostic on the first line of the block.
    if (diagnostics.length === 0 && stderr.trim().length > 0) {
        const docLine = contentStartLine;
        const lineLength =
            docLine < document.lineCount
                ? document.lineAt(docLine).text.length
                : 0;

        const range = new vscode.Range(docLine, 0, docLine, lineLength);
        const diagnostic = new vscode.Diagnostic(
            range,
            stderr.trim(),
            vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = "d2";
        diagnostics.push(diagnostic);
    }

    return diagnostics;
}

/**
 * Resolve the working directory for D2 invocation based on the document path.
 */
function resolveWorkingDir(document: vscode.TextDocument): string {
    const docDir = path.dirname(document.uri.fsPath);
    if (fs.existsSync(docDir)) {
        return docDir;
    }
    if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
    ) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return process.cwd();
}

/**
 * Run D2 diagnostics for all ```d2 blocks in a Markdown document and
 * publish them to the given DiagnosticCollection.
 */
export function updateDiagnostics(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection,
): void {
    if (document.languageId !== "markdown") {
        return;
    }

    const blocks = findD2Blocks(document);

    if (blocks.length === 0) {
        collection.delete(document.uri);
        return;
    }

    const cwd = resolveWorkingDir(document);
    const docUri = document.uri;

    // Run validation async to avoid blocking the extension host
    validateBlocksAsync(blocks, cwd, document).then((allDiagnostics) => {
        collection.set(docUri, allDiagnostics);
    });
}

async function validateBlocksAsync(
    blocks: D2Block[],
    cwd: string,
    document: vscode.TextDocument,
): Promise<vscode.Diagnostic[]> {
    const allDiagnostics: vscode.Diagnostic[] = [];

    for (const block of blocks) {
        const { code, contentStartLine } = block;

        if (code.length === 0) {
            continue;
        }

        const importMatch = code.match(/^\s*@import\s+["'](.+)["']\s*$/);

        let d2Args: string[];
        let input: string | undefined;

        if (importMatch) {
            const resolvedPath = path.resolve(cwd, importMatch[1]);
            if (!fs.existsSync(resolvedPath)) {
                const docLine = contentStartLine;
                const lineLength =
                    docLine < document.lineCount
                        ? document.lineAt(docLine).text.length
                        : 0;
                const range = new vscode.Range(docLine, 0, docLine, lineLength);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `File not found: ${resolvedPath}`,
                    vscode.DiagnosticSeverity.Error,
                );
                diagnostic.source = "d2";
                allDiagnostics.push(diagnostic);
                continue;
            }
            d2Args = ["validate", resolvedPath];
            input = undefined;
        } else {
            d2Args = ["validate", "-"];
            input = code;
        }

        try {
            const child = cp.spawn("d2", d2Args, { cwd });
            const stderr = await new Promise<string>((resolve) => {
                let data = "";
                child.stderr.on("data", (chunk: Buffer) => {
                    data += chunk.toString();
                });
                child.on("close", () => resolve(data));
                child.on("error", () => resolve(""));
                if (input) {
                    child.stdin.write(input);
                    child.stdin.end();
                }
            });

            if (stderr.trim().length > 0) {
                const blockDiagnostics = parseDiagnostics(
                    stderr,
                    contentStartLine,
                    document,
                );
                allDiagnostics.push(...blockDiagnostics);
            }
        } catch {
            // If spawning fails entirely, skip this block
        }
    }

    return allDiagnostics;
}

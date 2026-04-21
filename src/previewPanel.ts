import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export class D2PreviewPanel {
    private static instance: D2PreviewPanel | undefined;
    private panel: vscode.WebviewPanel;
    private disposed = false;
    private onDisposeEmitter = new vscode.EventEmitter<void>();
    public readonly onDidDispose = this.onDisposeEmitter.event;

    private constructor(_extensionUri: vscode.Uri) {
        this.panel = vscode.window.createWebviewPanel(
            "d2Preview",
            "D2 Preview",
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                localResourceRoots: [],
            },
        );

        this.panel.iconPath = undefined;
        this.panel.webview.html = D2PreviewPanel.buildHtml("");

        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === "setLayout") {
                const config = vscode.workspace.getConfiguration("d2InMarkdown");
                await config.update("layout", message.value, vscode.ConfigurationTarget.Global);
            } else if (message.type === "copyImage" && typeof message.data === "string") {
                try {
                    const base64 = message.data.replace(/^data:image\/png;base64,/, "");
                    const buffer = Buffer.from(base64, "base64");
                    const tmpPath = path.join(require("node:os").tmpdir(), `d2-clipboard-${Date.now()}.png`);
                    fs.writeFileSync(tmpPath, buffer);
                    const platform = process.platform;
                    if (platform === "win32") {
                        cp.spawnSync("powershell", ["-NoProfile", "-Command",
                            `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${tmpPath}'))`
                        ]);
                    } else if (platform === "darwin") {
                        cp.spawnSync("osascript", ["-e", `set the clipboard to (read (POSIX file "${tmpPath}") as «class PNGf»)`]);
                    } else {
                        cp.spawnSync("xclip", ["-selection", "clipboard", "-t", "image/png", "-i", tmpPath]);
                    }
                    fs.unlinkSync(tmpPath);
                    vscode.window.showInformationMessage("Diagram copied to clipboard");
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to copy image: ${e.message}`);
                }
            }
        });

        this.panel.onDidDispose(() => {
            this.disposed = true;
            D2PreviewPanel.instance = undefined;
            this.onDisposeEmitter.fire();
            this.onDisposeEmitter.dispose();
        });
    }

    static createOrShow(extensionUri: vscode.Uri): D2PreviewPanel {
        if (D2PreviewPanel.instance && !D2PreviewPanel.instance.disposed) {
            D2PreviewPanel.instance.panel.reveal(
                vscode.ViewColumn.Beside,
                true,
            );
            return D2PreviewPanel.instance;
        }
        const instance = new D2PreviewPanel(extensionUri);
        D2PreviewPanel.instance = instance;
        return instance;
    }

    isDisposed(): boolean {
        return this.disposed;
    }

    update(code: string | undefined, documentUri?: vscode.Uri): void {
        if (this.disposed) {
            return;
        }

        const config = vscode.workspace.getConfiguration("d2InMarkdown");
        const currentLayout = config.get<string>("layout", "dagre");

        if (code === undefined) {
            this.panel.webview.html = D2PreviewPanel.buildHtml(
                '<p class="placeholder">No D2 block found. Click "Preview" on a D2 code block or open a Markdown file with D2 blocks.</p>',
                currentLayout,
            );
            return;
        }

        const svg = this.renderD2(code, documentUri);
        this.panel.webview.html = D2PreviewPanel.buildHtml(svg, currentLayout);
    }

    private renderD2(
        code: string,
        documentUri: vscode.Uri | undefined,
    ): string {
        const importMatch = code.match(/^\s*@import\s+["'](.+)["']\s*$/);
        let d2Args = ["-"];
        let input = code;
        let cwd = process.cwd();

        if (
            vscode.workspace.workspaceFolders &&
            vscode.workspace.workspaceFolders.length > 0
        ) {
            cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }

        if (documentUri) {
            cwd = path.dirname(documentUri.fsPath);
        }

        if (importMatch) {
            const importPath = importMatch[1];
            const resolvedPath = path.resolve(cwd, importPath);
            if (fs.existsSync(resolvedPath)) {
                d2Args = [resolvedPath, "-"];
                input = "";
            } else {
                return `<p class="error">File not found: ${this.escapeHtml(resolvedPath)}</p>`;
            }
        }

        const config = vscode.workspace.getConfiguration("d2InMarkdown");
        const theme = config.get<number>("theme", 0);
        const darkTheme = config.get<number>("darkTheme", -1);
        const layout = config.get<string>("layout", "dagre");
        const sketch = config.get<boolean>("sketch", false);
        const pad = config.get<number>("pad", 100);
        const scale = config.get<number>("scale", -1);

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
            input: input || undefined,
            cwd: cwd,
            encoding: "utf-8",
        });

        if (result.error) {
            return `<p class="error">D2 execution failed: ${this.escapeHtml(result.error.message)}</p>`;
        }
        if (result.status !== 0) {
            return `<p class="error">D2 error:</p><pre class="error-detail">${this.escapeHtml(result.stderr)}</pre>`;
        }
        // Strip XML declaration (invalid in HTML) and ensure outer SVG has explicit dimensions
        let svgOutput = result.stdout.replace(/<\?xml[^?]*\?>/, "").trim();
        // If outer SVG has viewBox but no width/height, add them
        const vbMatch = svgOutput.match(/^<svg([^>]*)viewBox="[\d.\-\s]+ [\d.\-\s]+ ([\d.]+) ([\d.]+)"/);
        if (vbMatch && !svgOutput.match(/^<svg[^>]*\bwidth=/)) {
            svgOutput = svgOutput.replace(/^<svg/, `<svg width="${vbMatch[2]}" height="${vbMatch[3]}"`);
        }
        const config2 = vscode.workspace.getConfiguration("d2InMarkdown");
        const autoTheme = config2.get<boolean>("autoTheme", true);
        const containerClass = autoTheme ? "svg-container d2-auto-theme" : "svg-container";
        return `<div class="${containerClass}">${svgOutput}</div>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    private static buildHtml(body: string, layout?: string): string {
        const currentLayout = layout || "dagre";
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        html, body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #cccccc);
            font-family: var(--vscode-font-family, sans-serif);
            height: 100%;
            width: 100%;
        }
        .toolbar {
            position: fixed;
            top: 0; left: 0; right: 0;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: var(--vscode-titleBar-activeBackground, #333);
            border-bottom: 1px solid var(--vscode-panel-border, #444);
            user-select: none;
            z-index: 100;
        }
        .toolbar button {
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #ccc);
            border: none;
            padding: 3px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-family: inherit;
        }
        .toolbar button:hover {
            background: var(--vscode-button-secondaryHoverBackground, #505050);
        }
        .toolbar .zoom-level {
            font-size: 12px;
            color: var(--vscode-descriptionForeground, #888);
            min-width: 45px;
            text-align: center;
        }
        .toolbar .sep {
            width: 1px;
            height: 16px;
            background: var(--vscode-panel-border, #444);
            margin: 0 4px;
        }
        #diagram-area {
            position: absolute;
            top: 30px;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: auto;
            cursor: grab;
        }
        #diagram-area.panning {
            cursor: grabbing;
        }
        #diagram-wrapper {
            transform-origin: 0 0;
        }
        #diagram-wrapper svg {
            display: block;
        }
        .svg-container {
            display: inline-block;
        }
        .placeholder {
            color: var(--vscode-descriptionForeground, #888888);
            font-style: italic;
            font-size: 14px;
            padding: 32px 16px;
        }
        .error {
            color: var(--vscode-errorForeground, #f44747);
            font-size: 14px;
            padding: 16px;
        }
        .error-detail {
            color: var(--vscode-errorForeground, #f44747);
            font-size: 12px;
            white-space: pre-wrap;
            word-break: break-word;
            background: var(--vscode-textBlockQuote-background, #2a2a2a);
            padding: 8px 12px;
            border-radius: 4px;
            margin: 8px 16px;
            max-width: calc(100% - 32px);
        }
        /* Auto-theme: override D2 color classes with VS Code theme variables */
        .d2-auto-theme [class*="fill-N1"] { fill: var(--vscode-editor-foreground) !important; }
        .d2-auto-theme [class*="fill-N2"] { fill: var(--vscode-descriptionForeground) !important; }
        .d2-auto-theme [class*="fill-N3"] { fill: var(--vscode-disabledForeground) !important; }
        .d2-auto-theme [class*="fill-N4"] { fill: var(--vscode-sideBar-background) !important; }
        .d2-auto-theme [class*="fill-N5"] { fill: var(--vscode-editorWidget-background) !important; }
        .d2-auto-theme [class*="fill-N6"] { fill: var(--vscode-editorWidget-background) !important; }
        .d2-auto-theme [class*="fill-N7"] { fill: var(--vscode-editor-background) !important; }
        .d2-auto-theme [class*="fill-B1"] { fill: var(--vscode-focusBorder) !important; }
        .d2-auto-theme [class*="fill-B2"] { fill: var(--vscode-focusBorder) !important; }
        .d2-auto-theme [class*="fill-B3"] { fill: var(--vscode-sideBar-background) !important; }
        .d2-auto-theme [class*="fill-B4"] { fill: var(--vscode-sideBar-background) !important; }
        .d2-auto-theme [class*="fill-B5"] { fill: var(--vscode-editorWidget-background) !important; }
        .d2-auto-theme [class*="fill-B6"] { fill: var(--vscode-editorWidget-background) !important; }
        .d2-auto-theme [class*="stroke-N1"] { stroke: var(--vscode-editor-foreground) !important; }
        .d2-auto-theme [class*="stroke-N2"] { stroke: var(--vscode-descriptionForeground) !important; }
        .d2-auto-theme [class*="stroke-N3"] { stroke: var(--vscode-disabledForeground) !important; }
        .d2-auto-theme [class*="stroke-N4"] { stroke: var(--vscode-disabledForeground) !important; }
        .d2-auto-theme [class*="stroke-B1"] { stroke: var(--vscode-focusBorder) !important; }
        .d2-auto-theme [class*="stroke-B2"] { stroke: var(--vscode-focusBorder) !important; }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="zoom-in" title="Zoom in">+</button>
        <button id="zoom-out" title="Zoom out">&minus;</button>
        <span class="zoom-level" id="zoom-level">100%</span>
        <div class="sep"></div>
        <button id="zoom-fit" title="Fit to view">Fit</button>
        <button id="zoom-reset" title="Reset to 100%">1:1</button>
        <div class="sep"></div>
        <button id="layout-toggle" title="Switch layout engine">${currentLayout}</button>
        <div class="sep"></div>
        <button id="copy-image" title="Copy diagram as image">Copy</button>
    </div>
    <div id="diagram-area">
        <div id="diagram-wrapper">${body}</div>
    </div>
    <script>
    (function() {
        var area = document.getElementById('diagram-area');
        var wrapper = document.getElementById('diagram-wrapper');
        var zoomLevelEl = document.getElementById('zoom-level');

        var scale = 1, panX = 0, panY = 0;
        var isPanning = false, startX = 0, startY = 0;
        var MIN_SCALE = 0.05, MAX_SCALE = 10, ZOOM_STEP = 0.15;

        function applyTransform() {
            wrapper.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
            zoomLevelEl.textContent = Math.round(scale * 100) + '%';
        }

        function zoomAt(delta, cx, cy) {
            var oldScale = scale;
            scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (1 + delta)));
            var ratio = scale / oldScale;
            panX = cx - ratio * (cx - panX);
            panY = cy - ratio * (cy - panY);
            applyTransform();
        }

        function getNaturalSize() {
            var svg = wrapper.querySelector('svg');
            if (!svg) return null;
            var w = svg.getAttribute('width');
            var h = svg.getAttribute('height');
            if (w && h) return { w: parseFloat(w), h: parseFloat(h) };
            var vb = svg.getAttribute('viewBox');
            if (vb) {
                var parts = vb.split(/[\\s,]+/);
                if (parts.length === 4) return { w: parseFloat(parts[2]), h: parseFloat(parts[3]) };
            }
            // Measure by temporarily resetting
            wrapper.style.transform = 'none';
            var rect = svg.getBoundingClientRect();
            return { w: rect.width, h: rect.height };
        }

        function fitToView() {
            var size = getNaturalSize();
            if (!size || size.w === 0 || size.h === 0) return;
            var aw = area.clientWidth;
            var ah = area.clientHeight;
            if (aw === 0 || ah === 0) return;
            scale = Math.min(aw / size.w, ah / size.h, 2) * 0.95;
            panX = (aw - size.w * scale) / 2;
            panY = (ah - size.h * scale) / 2;
            applyTransform();
        }

        area.addEventListener('wheel', function(e) {
            e.preventDefault();
            var rect = area.getBoundingClientRect();
            zoomAt(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP, e.clientX - rect.left, e.clientY - rect.top);
        }, { passive: false });

        area.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            isPanning = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
            area.classList.add('panning');
        });
        window.addEventListener('mousemove', function(e) {
            if (!isPanning) return;
            panX = e.clientX - startX;
            panY = e.clientY - startY;
            applyTransform();
        });
        window.addEventListener('mouseup', function() {
            isPanning = false;
            area.classList.remove('panning');
        });

        document.getElementById('zoom-in').addEventListener('click', function() {
            var r = area.getBoundingClientRect();
            zoomAt(ZOOM_STEP, r.width / 2, r.height / 2);
        });
        document.getElementById('zoom-out').addEventListener('click', function() {
            var r = area.getBoundingClientRect();
            zoomAt(-ZOOM_STEP, r.width / 2, r.height / 2);
        });
        document.getElementById('zoom-reset').addEventListener('click', function() {
            scale = 1; panX = 0; panY = 0; applyTransform();
        });
        document.getElementById('zoom-fit').addEventListener('click', fitToView);

        function inlineStyles(source, clone) {
            var props = ['fill','stroke','color','opacity','font-family','font-size','font-weight','font-style',
                         'stroke-width','stroke-dasharray','stroke-linecap','stroke-linejoin','stroke-opacity',
                         'fill-opacity','text-anchor','dominant-baseline','visibility','display'];
            var srcEls = source.querySelectorAll('*');
            var clnEls = clone.querySelectorAll('*');
            for (var i = 0; i < srcEls.length; i++) {
                var cs = window.getComputedStyle(srcEls[i]);
                for (var j = 0; j < props.length; j++) {
                    var val = cs.getPropertyValue(props[j]);
                    if (val) clnEls[i].style.setProperty(props[j], val);
                }
            }
        }

        function copyAsImage() {
            var svg = wrapper.querySelector('svg');
            if (!svg) return;
            var copyBtn = document.getElementById('copy-image');
            var origText = copyBtn.innerHTML;

            var areaRect = area.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            var cw = areaRect.width;
            var ch = areaRect.height;

            var canvas = document.createElement('canvas');
            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
            var ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            var bg = window.getComputedStyle(document.body).backgroundColor || '#1e1e1e';
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, cw, ch);
            ctx.translate(panX, panY);
            ctx.scale(scale, scale);

            var clone = svg.cloneNode(true);
            inlineStyles(svg, clone);
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

            var svgData = new XMLSerializer().serializeToString(clone);
            var svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
            var img = new Image();
            img.onload = function() {
                ctx.drawImage(img, 0, 0);
                var pngDataUrl = canvas.toDataURL('image/png');
                vscode.postMessage({ type: 'copyImage', data: pngDataUrl });
                copyBtn.textContent = 'Copied!';
                setTimeout(function(){ copyBtn.innerHTML = origText; }, 1500);
            };
            img.onerror = function() {
                copyBtn.textContent = 'Failed';
                setTimeout(function(){ copyBtn.innerHTML = origText; }, 1500);
            };
            img.src = svgDataUrl;
        }

        var vscode = acquireVsCodeApi();
        document.getElementById('layout-toggle').addEventListener('click', function() {
            var btn = document.getElementById('layout-toggle');
            var next = btn.textContent.trim() === 'dagre' ? 'elk' : 'dagre';
            btn.textContent = next;
            vscode.postMessage({ type: 'setLayout', value: next });
        });

        document.getElementById('copy-image').addEventListener('click', copyAsImage);

        setTimeout(fitToView, 150);
    })();
    </script>
</body>
</html>`;
    }
}

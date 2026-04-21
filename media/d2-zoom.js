(function () {
    "use strict";

    var MIN_SCALE = 0.25;
    var MAX_SCALE = 5;
    var ZOOM_STEP = 0.15;

    function initDiagram(container) {
        if (container.dataset.d2ZoomInit) return;
        container.dataset.d2ZoomInit = "1";

        var svg = container.querySelector("svg");
        if (!svg) return;

        var scale = 1;
        var panX = 0;
        var panY = 0;
        var isPanning = false;
        var startX = 0;
        var startY = 0;

        // Create a toolbar — inserted before the SVG, no DOM restructuring
        var toolbar = document.createElement("div");
        toolbar.className = "d2-zoom-toolbar";
        toolbar.innerHTML =
            '<button class="d2-zoom-btn" data-action="in" title="Zoom in">+</button>' +
            '<button class="d2-zoom-btn" data-action="out" title="Zoom out">&minus;</button>' +
            '<span class="d2-zoom-level">100%</span>' +
            '<button class="d2-zoom-btn" data-action="fit" title="Fit">Fit</button>' +
            '<button class="d2-zoom-btn" data-action="reset" title="Reset">1:1</button>' +
            '<button class="d2-zoom-btn" data-action="copy" title="Copy as image">Copy</button>' +
            '<button class="d2-zoom-btn d2-fullscreen-btn" data-action="fullscreen" title="Toggle fullscreen">&#x26F6;</button>';
        container.insertBefore(toolbar, container.firstChild);

        var zoomLevelEl = toolbar.querySelector(".d2-zoom-level");

        function applyTransform() {
            svg.style.transform =
                "translate(" + panX + "px, " + panY + "px) scale(" + scale + ")";
            svg.style.transformOrigin = "0 0";
            zoomLevelEl.textContent = Math.round(scale * 100) + "%";
        }

        function zoomAt(delta, cx, cy) {
            var oldScale = scale;
            scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (1 + delta)));
            var ratio = scale / oldScale;
            panX = cx - ratio * (cx - panX);
            panY = cy - ratio * (cy - panY);
            applyTransform();
        }

        function fitToView() {
            var cw = container.clientWidth;
            var svgW = parseFloat(svg.getAttribute("width")) || svg.getBoundingClientRect().width;
            if (svgW === 0 || cw === 0) return;
            scale = Math.min(cw / svgW, 2) * 0.95;
            panX = 0;
            panY = 0;
            applyTransform();
        }

        function isActive() {
            return container.classList.contains("d2-active");
        }

        function deactivate() {
            container.classList.remove("d2-active");
            // Exit fullscreen if active
            if (container.classList.contains("d2-fullscreen")) {
                container.classList.remove("d2-fullscreen");
                var fsBtn = toolbar.querySelector('[data-action="fullscreen"]');
                if (fsBtn) { fsBtn.innerHTML = "&#x26F6;"; fsBtn.title = "Toggle fullscreen"; }
            }
            scale = 1; panX = 0; panY = 0; applyTransform();
        }

        function inlineStyles(source, clone) {
            var props = ['fill','stroke','color','opacity','font-family','font-size','font-weight','font-style',
                         'stroke-width','stroke-dasharray','stroke-linecap','stroke-linejoin','stroke-opacity',
                         'fill-opacity','text-anchor','dominant-baseline','visibility','display'];
            var srcEls = source.querySelectorAll('*');
            var clnEls = clone.querySelectorAll('*');
            for (var ii = 0; ii < srcEls.length; ii++) {
                var cs = window.getComputedStyle(srcEls[ii]);
                for (var jj = 0; jj < props.length; jj++) {
                    var val = cs.getPropertyValue(props[jj]);
                    if (val) clnEls[ii].style.setProperty(props[jj], val);
                }
            }
        }

        function copyAsImage() {
            var copyBtn = toolbar.querySelector('[data-action="copy"]');
            var origText = copyBtn.innerHTML;

            var containerRect = container.getBoundingClientRect();
            var toolbarRect = toolbar.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            var cw = containerRect.width;
            var ch = containerRect.height - toolbarRect.height;

            var canvas = document.createElement('canvas');
            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
            var ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            var bg = window.getComputedStyle(container).backgroundColor;
            if (!bg || bg === 'rgba(0, 0, 0, 0)') bg = window.getComputedStyle(document.body).backgroundColor || '#ffffff';
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
                canvas.toBlob(function(pngBlob) {
                    if (!pngBlob) { copyBtn.textContent = 'Failed'; setTimeout(function(){ copyBtn.innerHTML = origText; }, 1500); return; }
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': pngBlob })
                    ]).then(function() {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(function(){ copyBtn.innerHTML = origText; }, 1500);
                    }).catch(function() {
                        copyBtn.textContent = 'Failed';
                        setTimeout(function(){ copyBtn.innerHTML = origText; }, 1500);
                    });
                }, 'image/png');
            };
            img.onerror = function() {
                copyBtn.textContent = 'Failed';
                setTimeout(function(){ copyBtn.innerHTML = origText; }, 1500);
            };
            img.src = svgDataUrl;
        }

        // Click to activate
        container.addEventListener("click", function (e) {
            if (!isActive() && !e.target.closest(".d2-zoom-toolbar")) {
                e.stopPropagation();
                container.classList.add("d2-active");
            }
        });

        // Click outside to deactivate
        document.addEventListener("mousedown", function (e) {
            if (isActive() && !container.contains(e.target)) {
                deactivate();
            }
        });

        // Wheel zoom on the container (only when active)
        container.addEventListener("wheel", function (e) {
            if (!isActive()) return;
            e.preventDefault();
            e.stopPropagation();
            var rect = container.getBoundingClientRect();
            var cx = e.clientX - rect.left;
            var cy = e.clientY - rect.top;
            var delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
            zoomAt(delta, cx, cy);
        }, { passive: false });

        // Pan via mouse drag on the container (only when active)
        container.addEventListener("mousedown", function (e) {
            if (!isActive()) return;
            if (e.button !== 0 || e.target.closest(".d2-zoom-toolbar")) return;
            isPanning = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
            container.style.cursor = "grabbing";
            e.preventDefault();
        });
        document.addEventListener("mousemove", function (e) {
            if (!isPanning) return;
            panX = e.clientX - startX;
            panY = e.clientY - startY;
            applyTransform();
        });
        document.addEventListener("mouseup", function () {
            if (!isPanning) return;
            isPanning = false;
            container.style.cursor = "";
        });

        // Toolbar button clicks
        toolbar.addEventListener("click", function (e) {
            var btn = e.target.closest("[data-action]");
            if (!btn) return;
            var action = btn.dataset.action;
            var rect = container.getBoundingClientRect();
            if (action === "in") zoomAt(ZOOM_STEP, rect.width / 2, rect.height / 2);
            else if (action === "out") zoomAt(-ZOOM_STEP, rect.width / 2, rect.height / 2);
            else if (action === "reset") { scale = 1; panX = 0; panY = 0; applyTransform(); }
            else if (action === "fit") fitToView();
            else if (action === "copy") copyAsImage();
            else if (action === "fullscreen") {
                container.classList.toggle("d2-fullscreen");
                var isFs = container.classList.contains("d2-fullscreen");
                btn.innerHTML = isFs ? "&#x2716;" : "&#x26F6;";
                btn.title = isFs ? "Exit fullscreen" : "Toggle fullscreen";
                if (isFs) {
                    setTimeout(fitToView, 50);
                } else {
                    scale = 1; panX = 0; panY = 0; applyTransform();
                }
            }
        });

        // Escape key exits fullscreen or deactivates
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                if (container.classList.contains("d2-fullscreen")) {
                    container.classList.remove("d2-fullscreen");
                    var fsBtn = toolbar.querySelector('[data-action="fullscreen"]');
                    if (fsBtn) { fsBtn.innerHTML = "&#x26F6;"; fsBtn.title = "Toggle fullscreen"; }
                    scale = 1; panX = 0; panY = 0; applyTransform();
                } else if (isActive()) {
                    deactivate();
                }
            }
        });
    }

    function initAll() {
        var diagrams = document.querySelectorAll(".d2-diagram:not([data-d2-zoom-init])");
        for (var i = 0; i < diagrams.length; i++) {
            initDiagram(diagrams[i]);
        }
    }

    // Run after a short delay to let the preview finish rendering
    setTimeout(initAll, 200);

    // Watch for new diagrams (e.g. preview refresh) — only act on new uninitialized ones
    var observer = new MutationObserver(function (mutations) {
        // Only check if new nodes were added
        var hasNewNodes = false;
        for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes.length > 0) { hasNewNodes = true; break; }
        }
        if (hasNewNodes) {
            setTimeout(initAll, 100);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();

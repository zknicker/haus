import {
    agentHtmlSandbox,
    type VisualColorScheme,
    visualD3Url,
    visualHeights,
    visualSizeMessageType,
    visualTopojsonClientUrl,
    visualUsAtlasStatesUrl,
    visualWorldAtlasCountriesUrl,
} from '@haus/api/widgets/visual/frame';

/**
 * The only network requests a preview may make: the pinned files the frame
 * CSP already names. The CSP is the first wall; this browser-level allowlist
 * is the second, so nothing an agent wrote reaches any other host even if a
 * request slips past the document policy.
 */
const allowedRemoteUrls = new Set([
    visualD3Url,
    visualTopojsonClientUrl,
    visualUsAtlasStatesUrl,
    visualWorldAtlasCountriesUrl,
]);

export function isAllowedPreviewRequest(url: string): boolean {
    return url.startsWith('data:') || url.startsWith('blob:') || allowedRemoteUrls.has(url);
}

/** What the host page records about the frame's size handshake. */
export interface HostSizeState {
    /** Clamped height applied to the frame. */
    height: number;
    /** Last raw height the frame reported, or null before the first report. */
    reported: number | null;
}

/** Reads `HostSizeState` from the host page's main world. */
export const hostSizeExpression = 'JSON.stringify(window.hausVisualSize)';

/**
 * Mirrors the chat's VisualCard and the visuals lab host
 * (`scripts/visuals-lab/engine/render.mjs`): a plain block at the reply
 * column's width, a transparent sandboxed iframe, the app background showing
 * through, and the same clamp on the size handshake.
 */
export function hostPageHtml({
    scheme,
    tokensCss,
    width,
}: {
    scheme: VisualColorScheme;
    tokensCss: string;
    width: number;
}): string {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
:root { color-scheme: ${scheme};
${tokensCss}
}
body { margin: 0; background: var(--background); }
#shell { width: ${width}px; }
#frame { display: block; width: 100%; border: 0; background: transparent; }
</style></head><body>
<div id="shell"><iframe id="frame" sandbox="${agentHtmlSandbox}" style="height: ${visualHeights.fallback}px"></iframe></div>
<script>
window.hausVisualSize = { height: ${visualHeights.fallback}, reported: null };
window.hausRenderVisual = function (srcDoc) {
    document.getElementById('frame').srcdoc = srcDoc;
};
addEventListener('message', function (event) {
    var frame = document.getElementById('frame');
    if (!frame || event.source !== frame.contentWindow) { return; }
    var data = event.data;
    if (!data || data.type !== '${visualSizeMessageType}' || typeof data.height !== 'number' || !isFinite(data.height)) { return; }
    var height = Math.min(${visualHeights.max}, Math.max(${visualHeights.min}, Math.round(data.height)));
    frame.style.height = height + 'px';
    window.hausVisualSize = { height: height, reported: data.height };
});
</script>
</body></html>`;
}

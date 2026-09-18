import * as React from 'react';
import { agentHtmlSandbox } from '../../agent-html/sandbox.ts';
import { agentHtmlColorScheme, agentHtmlTokenDeclarations } from '../../agent-html/tokens.ts';

/**
 * Generative visual: model-authored HTML rendered in a sandboxed iframe.
 * Containment mirrors the html-preview posture — opaque origin, srcDoc,
 * scripts allowed, never allow-same-origin — plus a CSP that pins every
 * allowed external source to the exact CDN files below. Treat the body as
 * attacker-controlled; nothing from the fence may reach the app origin.
 */

/**
 * The allowed external scripts, pinned by version. Bumping a pin — or adding
 * one — is a deliberate supply-chain decision: update the skill guidance and
 * this CSP together (docs/internals/widgets.md).
 */
export const visualChartJsUrl = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
export const visualD3Url = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js';
export const visualTopojsonClientUrl =
    'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js';

/**
 * The allowed `fetch` targets: map topology, pinned to the exact atlas file.
 * A choropleth needs real geometry, and these are the only two responses the
 * frame may read — `connect-src` is otherwise the exfiltration channel, so it
 * lists files, never an origin.
 */
export const visualUsAtlasStatesUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json';
export const visualWorldAtlasCountriesUrl =
    'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';

const visualCsp = [
    "default-src 'none'",
    // Chart.js keeps its versioned-directory prefix; the map libraries are
    // narrowed all the way to the file.
    `script-src 'unsafe-inline' https://cdn.jsdelivr.net/npm/chart.js@4.5.1/ ${visualD3Url} ${visualTopojsonClientUrl}`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    `connect-src ${visualUsAtlasStatesUrl} ${visualWorldAtlasCountriesUrl}`,
    "form-action 'none'",
    "base-uri 'none'",
].join('; ');

export const visualHeights = {
    fallback: 240,
    // Resource guard for pathological documents, not an ordinary report limit.
    max: 100_000,
    min: 120,
} as const;

// While a visual is still streaming, srcdoc rewrites are throttled so the
// browser reparses at a readable cadence instead of per delta.
const streamingRedrawMs = 300;

export function VisualCard({
    html,
    open = false,
    title,
}: {
    html: string;
    open?: boolean;
    title?: string;
}) {
    const displayHtml = useThrottledValue(html, open ? streamingRedrawMs : 0);
    const tokensCss = useVisualTokens();
    const frameRef = React.useRef<HTMLIFrameElement | null>(null);
    const contentHeight = useReportedContentHeight(frameRef);
    const height = clampHeight(contentHeight ?? visualHeights.fallback);

    return (
        // No shell: the visual is a transparent block in the reply column, so
        // the conversation is its container and a card inside it would read as
        // a card in a card. The cap is a drawn figure's measure — the same one
        // narration and legacy widget rows use — not the reply column, which
        // runs wider (ADR 0031).
        <div className="w-full min-w-0 max-w-[46rem]">
            <iframe
                className="block w-full border-0 bg-transparent"
                ref={frameRef}
                sandbox={agentHtmlSandbox}
                srcDoc={buildVisualSrcDoc(displayHtml, tokensCss)}
                style={{ height }}
                title={title ?? 'Visual'}
            />
        </div>
    );
}

/**
 * Compose the sandbox document: CSP, snapshot of app theme tokens, a minimal
 * base style, and a host-owned size reporter — then the model body. Host
 * plumbing lives in the head so the model content streams last and partial
 * bodies still parse (error-tolerant HTML parsing is the streaming renderer).
 */
export function buildVisualSrcDoc(html: string, tokensCss: string): string {
    const scheme = agentHtmlColorScheme();
    return [
        '<!doctype html><html><head><meta charset="utf-8">',
        `<meta http-equiv="Content-Security-Policy" content="${visualCsp}">`,
        '<style>',
        `:root { color-scheme: ${scheme}; ${tokensCss ? `\n${tokensCss}` : ''} }`,
        '* { box-sizing: border-box; }',
        // Native controls (range, checkbox, radio, progress) otherwise paint
        // the browser's default accent, the one thing in a visual that looks
        // like another product. HeroUI's own Checkbox and Slider fill with
        // `--accent`, so the frame's emphasis role is what they inherit.
        'body { accent-color: var(--accent, currentColor); }',
        'body { margin: 0; padding: 8px 0; background: transparent; color: var(--foreground, inherit); font-family: var(--font-sans, system-ui, sans-serif); font-size: var(--app-ui-font-size, 14px); line-height: 1.5; -webkit-font-smoothing: antialiased; }',
        // Plain <table> markup wears the same look a Markdown table gets in
        // the reply around it (`.chat-markdown table` in default-theme.css),
        // so the interactive or bounded-record table a visual is for and the
        // detail table in the reply read as one message.
        'table { width: 100%; border-collapse: collapse; caption-side: bottom; font-size: var(--app-ui-font-size, 14px); }',
        'th { padding: 8px 12px; text-align: left; vertical-align: middle; font-weight: 500; color: var(--foreground); line-height: 1.1; }',
        'td { padding: 8px 12px; vertical-align: middle; color: var(--muted-foreground); line-height: 1.2; }',
        'tr { border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }',
        'tbody tr:hover { background: color-mix(in srgb, var(--foreground) 5%, transparent); }',
        'tfoot { font-weight: 500; } tfoot tr { border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); border-bottom: none; }',
        // The scroller below carries the caption out of view with the table it
        // labels. Sticking it to the scrollport's left edge fixes that, but only
        // once it stops being table-wide: a caption box as wide as the table has
        // nothing left to offset. Both halves verified in WebKit and Chromium.
        'caption { position: sticky; left: 0; width: max-content; max-width: 100%; margin-top: 12px; color: var(--muted-foreground); text-align: left; }',
        // Bare form controls otherwise render as the browser's, which reads as
        // another product inside a Haus reply. These five carry HeroUI's field
        // and outline-button metrics in published tokens — the field radius
        // tier, a hairline edge, the surface behind it, the control pad — so an
        // agent gets native-looking controls out of plain markup and never
        // hand-rolls chrome. Range is the exception: it keeps its own track and
        // takes the frame's accent from the body rule above.
        'input, select, textarea { font: inherit; color: var(--foreground); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--pad-sm) var(--pad-md); }',
        'button { font: inherit; font-weight: 500; color: var(--foreground); background: transparent; border: 1px solid var(--border); border-radius: var(--radius); padding: var(--pad-sm) var(--pad-md); cursor: pointer; }',
        'button:hover { background: var(--surface-secondary); }',
        'input[type="range"] { width: 100%; padding: 0; border: none; background: transparent; }',
        ':is(input, select, textarea, button):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }',
        '</style>',
        `<script>${sizeReporterScript}</script>`,
        '</head><body>',
        html,
        '</body></html>',
    ].join('\n');
}

// Host-owned plumbing, not a fence capability: reports the document height so
// the host can fit content inside the clamp. The parent trusts nothing else
// from the frame and clamps whatever arrives.
const sizeReporterScript = `(function () {
    // The frame does not scroll, so a table wider than the body would
    // simply be cut off. Each table gets its own horizontal scroller before the
    // first size report; table layout itself is untouched, so a narrow table
    // still spans the full width.
    var wrapWideTables = function () {
        var tables = document.querySelectorAll('table');
        for (var i = 0; i < tables.length; i += 1) {
            var table = tables[i];
            var parent = table.parentNode;
            if (!parent || (parent.getAttribute
                && parent.getAttribute('data-haus-table-scroll') === 'true')) {
                continue;
            }
            var wrapper = document.createElement('div');
            wrapper.setAttribute('data-haus-table-scroll', 'true');
            wrapper.setAttribute(
                'style',
                'overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch;'
            );
            parent.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }
    };
    var report = function () {
        // Body offsetHeight fits content; documentElement.scrollHeight never
        // shrinks below the frame's own height, so it cannot shrink-to-fit.
        var body = document.body;
        var height = body ? body.offsetHeight : document.documentElement.scrollHeight;
        parent.postMessage({ height: Math.ceil(height), type: 'haus-visual-size' }, '*');
    };
    addEventListener('DOMContentLoaded', function () {
        wrapWideTables();
        report();
        if (typeof ResizeObserver === 'function' && document.body) {
            new ResizeObserver(report).observe(document.body);
        }
    });
    addEventListener('load', report);
})();`;

function clampHeight(value: number) {
    return Math.min(visualHeights.max, Math.max(visualHeights.min, Math.round(value)));
}

// Size messages are only trusted when they come from this card's own frame;
// anything else on the window channel is ignored.
function useReportedContentHeight(frameRef: React.RefObject<HTMLIFrameElement | null>) {
    const [height, setHeight] = React.useState<number | null>(null);

    React.useEffect(() => {
        function onMessage(event: MessageEvent) {
            if (!frameRef.current || event.source !== frameRef.current.contentWindow) {
                return;
            }
            const data = event.data as { height?: unknown; type?: unknown } | null;
            if (data?.type !== 'haus-visual-size' || typeof data.height !== 'number') {
                return;
            }
            if (Number.isFinite(data.height) && data.height > 0) {
                setHeight(data.height);
            }
        }

        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [frameRef]);

    return height;
}

function useThrottledValue<Value>(value: Value, delayMs: number): Value {
    const [throttled, setThrottled] = React.useState(value);
    const lastUpdateRef = React.useRef(0);

    React.useEffect(() => {
        if (delayMs <= 0) {
            setThrottled(value);
            return;
        }
        const elapsed = Date.now() - lastUpdateRef.current;
        if (elapsed >= delayMs) {
            lastUpdateRef.current = Date.now();
            setThrottled(value);
            return;
        }
        const timer = setTimeout(() => {
            lastUpdateRef.current = Date.now();
            setThrottled(value);
        }, delayMs - elapsed);
        return () => clearTimeout(timer);
    }, [delayMs, value]);

    return throttled;
}

// Snapshot synchronously on first render — an effect-time srcdoc update can
// race the iframe's initial navigation and leave a tokenless document — and
// again when the app theme flips, so visuals follow the active scheme.
function useVisualTokens() {
    const [tokens, setTokens] = React.useState(() => agentHtmlTokenDeclarations());

    React.useEffect(() => {
        const observer = new MutationObserver(() => setTokens(agentHtmlTokenDeclarations()));
        observer.observe(document.documentElement, {
            attributeFilter: ['data-theme'],
            attributes: true,
        });
        return () => observer.disconnect();
    }, []);

    return tokens;
}

// Renders one model-authored visual through the real product frame: the same
// `buildVisualSrcDoc` the chat card builds, inside a host page that mirrors
// the card shell, screenshotted in both schemes.
//
// Nothing here re-implements the frame. The only things this file owns are the
// shell box the card would draw around the iframe and the size handshake the
// React card normally performs.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from '../../agent-html-tokens/generate-ios-tokens.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const websiteRequire = createRequire(path.join(here, '../../../apps/website/package.json'));
const { chromium } = websiteRequire('@playwright/test');

// visual-card.tsx resolves the active scheme through `agentHtmlColorScheme()`,
// which reads `document.documentElement.dataset.theme`. Bun has no DOM, so
// stand up the one field that function touches before the module loads — and
// flip it per scheme below, exactly as the app's theme toggle does.
globalThis.document ??= { documentElement: { dataset: { theme: 'dark' } } };

const { buildVisualSrcDoc, visualHeights } = await import(
    '../../../apps/website/src/features/chats/visual-card.tsx'
);
const { agentHtmlSandbox } = await import('../../../apps/website/src/agent-html/sandbox.ts');

const schemes = ['dark', 'light'];
const tokensCssByScheme = new Map(
    schemes.map((scheme) => [
        scheme,
        resolveTokens(scheme)
            .map((token) => `${token.name}: ${token.value};`)
            .join('\n'),
    ])
);

export { agentHtmlSandbox, visualHeights };

/** The published token declarations for a scheme, as the CSS text the frame injects. */
export const tokensCssFor = (scheme) => tokensCssByScheme.get(scheme) ?? '';

/**
 * The exact srcdoc the chat card would build for this scheme. `buildVisualSrcDoc`
 * reads the scheme off `document.documentElement.dataset.theme`, so flip it here —
 * the one place that knows the scheme — just as the app's theme toggle does.
 */
export const buildVisualDocument = ({ html, scheme }) => {
    globalThis.document.documentElement.dataset.theme = scheme;
    return buildVisualSrcDoc(html, tokensCssFor(scheme));
};

export const createVisualRenderer = async ({ width = 736 } = {}) => {
    const browser = await chromium.launch();
    const page = await browser.newPage({
        deviceScaleFactor: 2,
        viewport: { height: 1200, width: width + 160 },
    });

    // Anything a visual logs as an error — a thrown script, a blocked resource,
    // a CSP refusal — is a finding, so collect it here once and hand it back
    // with the render instead of leaving it in a console nobody reads.
    const consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    return {
        close: () => browser.close(),
        // `ready: 'network'` is the opt-in for a visual that fetches its own
        // data — a choropleth pulling pinned map topology, say. Its first size
        // report lands before the fetch does, so the capture waits for the
        // network to go quiet and lets the ResizeObserver's second report
        // resize the frame. Everything else keeps the plain paint wait.
        render: async ({ html, outDir, ready = 'paint', slug }) => {
            const errors = [];
            const files = {};
            const heights = {};
            for (const scheme of schemes) {
                consoleErrors.length = 0;
                await page.setContent(
                    hostPage({ scheme, tokensCss: tokensCssFor(scheme), width }),
                    { waitUntil: 'domcontentloaded' }
                );
                await page.evaluate(
                    (srcDoc) => window.hausRenderVisual(srcDoc),
                    buildVisualDocument({ html, scheme })
                );
                // A visual that never reports a size still gets captured at the
                // fallback height; a missing handshake is itself a finding.
                await page
                    .waitForFunction(() => window.hausVisualSized === true, null, {
                        timeout: 15_000,
                    })
                    .catch(() => null);
                if (ready === 'network') {
                    await page.waitForLoadState('networkidle').catch(() => null);
                }
                // Chart.js paints on its own frame after the size report.
                await page.waitForTimeout(500);
                const file = `${slug}-${scheme}.png`;
                await page.locator('#shell').screenshot({ path: path.join(outDir, file) });
                files[scheme] = file;
                heights[scheme] = await page.evaluate(
                    () => document.getElementById('frame').getBoundingClientRect().height
                );
                errors.push(...consoleErrors.map((text) => `${scheme}: ${text}`));
            }
            return { errors, files, heights };
        },
    };
};

// Mirrors VisualCard (visual-card.tsx): no shell at all — a plain block at
// the reply column's width, a transparent iframe, the app background showing
// through. The lab page draws its own ground around `buildVisualDocument`, so
// this host is only for the screenshot.
function hostPage({ scheme, tokensCss, width }) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
:root { color-scheme: ${scheme};
${tokensCss}
}
body { margin: 0; padding: 48px; background: var(--background); }
#shell { width: ${width}px; }
#frame { display: block; width: 100%; border: 0; background: transparent; }
</style></head><body>
<div id="shell"><iframe id="frame" sandbox="${agentHtmlSandbox}" style="height: ${visualHeights.fallback}px"></iframe></div>
<script>
window.hausVisualSized = false;
window.hausRenderVisual = function (srcDoc) {
    document.getElementById('frame').srcdoc = srcDoc;
};
addEventListener('message', function (event) {
    var frame = document.getElementById('frame');
    if (!frame || event.source !== frame.contentWindow) { return; }
    var data = event.data;
    if (!data || data.type !== 'haus-visual-size' || typeof data.height !== 'number') { return; }
    var height = Math.min(${visualHeights.max}, Math.max(${visualHeights.min}, Math.round(data.height)));
    frame.style.height = height + 'px';
    window.hausVisualSized = true;
});
</script>
</body></html>`;
}

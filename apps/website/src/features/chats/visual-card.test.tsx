import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    buildVisualSrcDoc,
    VisualCard,
    visualChartJsUrl,
    visualD3Url,
    visualTopojsonClientUrl,
    visualUsAtlasStatesUrl,
    visualWorldAtlasCountriesUrl,
} from './visual-card.tsx';

/** The policy the sandbox document actually carries, read off its meta tag. */
const cspOf = (doc: string) =>
    doc.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1] ?? '';

test('renders a sandboxed opaque-origin iframe around the visual body', () => {
    const markup = renderToStaticMarkup(
        <VisualCard html="<h1>Weekly sales</h1><svg></svg>" title="Weekly sales" />
    );

    expect(markup).toContain('<iframe');
    expect(markup).toContain(
        'sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-scripts"'
    );
    expect(markup).not.toContain('allow-same-origin');
    expect(markup).toContain('title="Weekly sales"');
    expect(markup).toContain('&lt;h1&gt;Weekly sales&lt;/h1&gt;');
});

test('the sandbox document pins external sources to the exact CDN files', () => {
    const doc = buildVisualSrcDoc('<div>chart</div>', '');

    expect(doc).toContain('Content-Security-Policy');
    expect(cspOf(doc)).toBe(
        [
            "default-src 'none'",
            "script-src 'unsafe-inline' https://cdn.jsdelivr.net/npm/chart.js@4.5.1/" +
                ' https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js' +
                ' https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js',
            "style-src 'unsafe-inline'",
            'img-src data: blob:',
            'font-src data:',
            'connect-src https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json' +
                ' https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json',
            "form-action 'none'",
            "base-uri 'none'",
        ].join('; ')
    );
});

test('the sandbox CSP names no other origin and no wildcard', () => {
    const csp = cspOf(buildVisualSrcDoc('<div>map</div>', ''));

    expect(csp.match(/https?:\/\/[^\s;]+/g)).toEqual([
        'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/',
        visualD3Url,
        visualTopojsonClientUrl,
        visualUsAtlasStatesUrl,
        visualWorldAtlasCountriesUrl,
    ]);
    expect(csp).not.toContain('*');
    expect(csp).not.toContain('unsafe-eval');
});

test('every allowed CDN resource is pinned to an exact version and path', () => {
    for (const url of [
        visualChartJsUrl,
        visualD3Url,
        visualTopojsonClientUrl,
        visualUsAtlasStatesUrl,
        visualWorldAtlasCountriesUrl,
    ]) {
        expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/[\w.-]+@\d+\.\d+\.\d+\/[\w./-]+$/);
    }
});

test('the sandbox fallback uses HeroUI body typography', () => {
    const doc = buildVisualSrcDoc('<p>Body</p>', '');

    expect(doc).toContain('font-size: var(--app-ui-font-size, 14px)');
});

test('the model body streams last so partial documents still parse', () => {
    const doc = buildVisualSrcDoc('<div><h2>Par', '--foreground: #fff;');

    expect(doc.indexOf('haus-visual-size')).toBeLessThan(doc.indexOf('<div><h2>Par'));
    expect(doc.indexOf('--foreground: #fff;')).toBeLessThan(doc.indexOf('<div><h2>Par'));
    expect(doc.trimEnd().endsWith('</body></html>')).toBe(true);
});

test('malformed html still renders inside the sandbox instead of failing', () => {
    const markup = renderToStaticMarkup(
        <VisualCard html={'<div><h1>Broken<span style="color:'} open />
    );

    expect(markup).toContain('<iframe');
    expect(markup).toContain('Broken');
});

test('the sandbox paints native controls with the frame accent, not the browser one', () => {
    const doc = buildVisualSrcDoc('<input type="range">', '');

    expect(doc).toContain('accent-color: var(--accent, currentColor)');
});

test('the sandbox pre-styles bare form controls in published tokens', () => {
    const doc = buildVisualSrcDoc('<input><select></select><button>Go</button>', '');

    // Field metrics: the control radius tier, a hairline edge, the surface
    // behind it, the control pad — every value a published name.
    expect(doc).toContain(
        'input, select, textarea { font: inherit; color: var(--foreground); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--pad-sm) var(--pad-md); }'
    );
    // A button is HeroUI's outline variant: transparent over a hairline.
    expect(doc).toContain(
        'button { font: inherit; font-weight: 500; color: var(--foreground); background: transparent; border: 1px solid var(--border); border-radius: var(--radius); padding: var(--pad-sm) var(--pad-md); cursor: pointer; }'
    );
    expect(doc).toContain('button:hover { background: var(--surface-secondary); }');
    // Range keeps its own track and takes the accent from the body rule.
    expect(doc).toContain(
        'input[type="range"] { width: 100%; padding: 0; border: none; background: transparent; }'
    );
    expect(doc).toContain(
        ':is(input, select, textarea, button):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }'
    );
    // Never suppressed, only restyled.
    expect(doc).not.toContain('outline: none');
});

test('the sandbox gives every table its own scroller before the first size report', () => {
    const doc = buildVisualSrcDoc('<table><tr><td>wide</td></tr></table>', '');

    expect(doc).toContain('data-haus-table-scroll');
    expect(doc).toContain('overflow-x: auto; max-width: 100%; -webkit-overflow-scrolling: touch;');
    expect(doc.indexOf('wrapWideTables();')).toBeLessThan(doc.indexOf('report();'));
    expect(doc.indexOf('report();')).toBeLessThan(doc.indexOf('<table><tr><td>wide</td>'));
    // Layout is untouched, so a narrow table still spans the card.
    expect(doc).toContain('table { width: 100%; border-collapse: collapse;');
    expect(doc).not.toContain('display: block');
    // The height report still comes off the body, wrapper or not.
    expect(doc).toContain('new ResizeObserver(report).observe(document.body)');
});

test('the sandbox keeps a table caption visible while the table pans', () => {
    const doc = buildVisualSrcDoc('<table><caption>Sales</caption></table>', '');

    // Sticky alone is not enough: a caption box is table-wide, so it has to
    // shrink to its content before `left: 0` has anything to hold on to.
    // Verified in WebKit and Chromium against the wrapper the reporter adds.
    expect(doc).toContain(
        'caption { position: sticky; left: 0; width: max-content; max-width: 100%;'
    );
});

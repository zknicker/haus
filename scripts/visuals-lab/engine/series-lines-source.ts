/**
 * The in-frame series-stroke sampler, as plain JavaScript source spliced into
 * `layoutFactsSource`. It samples every stroked, unfilled svg line that could
 * be a data series in screen coordinates and names it as a reader would (its
 * own label, a legend swatch in its color, or a direct label in its color).
 * Chart chrome (grid, border, label and background colors) is skipped here;
 * `coincidentLines` (coincident-lines.ts) does the judging.
 */
export const seriesLinesSource = `function (visible, snippet) {
    var maxLines = 24;
    var maxScan = 120;
    var maxPoints = 300;
    var rootStyle = getComputedStyle(document.documentElement);
    var resolve = function (token) {
        if (!rootStyle.getPropertyValue(token).trim()) { return null; }
        var probe = document.createElement('span');
        probe.style.color = 'var(' + token + ')';
        document.body.appendChild(probe);
        var color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    };
    var chrome = { 'rgba(0, 0, 0, 0)': 1 };
    ['--chart-grid', '--chart-label', '--border', '--background', '--surface'].forEach(function (token) {
        var color = resolve(token);
        if (color) { chrome[color] = 1; }
    });
    var unfilled = function (style) {
        return style.fill === 'none' || style.fill === 'rgba(0, 0, 0, 0)' || parseFloat(style.fillOpacity) === 0;
    };
    var ownText = function (el) { return snippet(el && el.textContent); };
    var nextText = function (el) {
        for (var sib = el.nextSibling; sib; sib = sib.nextSibling) {
            var text = snippet(sib.textContent);
            if (text) { return text; }
            if (sib.nodeType === 1) { return ''; }
        }
        return '';
    };
    var paints = function (style, color) {
        return style.backgroundColor === color || style.fill === color || style.stroke === color
            || (style.borderTopStyle !== 'none' && style.borderTopColor === color);
    };
    // Another plotted line in the same color is not a legend swatch.
    var otherSeries = function (candidate, svg) {
        var tag = candidate.tagName.toLowerCase();
        if (candidate.ownerSVGElement !== svg) { return false; }
        return tag === 'path' || tag === 'polyline'
            || (tag === 'line' && candidate.getBoundingClientRect().width > 40);
    };
    // A legend swatch painted in the series color names it by its next text;
    // failing that, a direct label in the series color names it.
    var legendFor = function (el, color, svg) {
        var colored = '';
        for (var scope = svg.parentElement, depth = 0; scope && depth < 4; scope = scope.parentElement, depth += 1) {
            var candidates = scope.querySelectorAll('*');
            for (var k = 0; k < candidates.length && k < 600; k += 1) {
                var candidate = candidates[k];
                if (candidate === el || candidate === svg || otherSeries(candidate, svg)) { continue; }
                var style = getComputedStyle(candidate);
                var text = ownText(candidate);
                if (!text && paints(style, color)) {
                    var label = nextText(candidate);
                    if (label) { return label; }
                } else if (!colored && text && candidate.children.length === 0
                    && (style.color === color || style.fill === color)) {
                    colored = text;
                }
            }
        }
        return colored;
    };
    var svgs = [];
    var lines = [];
    var els = document.querySelectorAll('svg path, svg polyline, svg line');
    // One odd element (a degenerate path, a non-invertible transform) must skip
    // itself, not throw away every other layout finding with it.
    var sample = function (el) {
        if (el.closest('defs, clipPath, mask, marker, pattern, symbol') || !visible(el)) { return null; }
        // Icons and ticks are narrower than any series the analysis would keep.
        if (el.getBoundingClientRect().width < 40) { return null; }
        var style = getComputedStyle(el);
        var stroke = style.stroke;
        if (!stroke || stroke === 'none' || stroke.indexOf('url(') === 0 || chrome[stroke]) { return null; }
        if (parseFloat(style.strokeOpacity) === 0 || parseFloat(style.strokeWidth) === 0) { return null; }
        if (el.tagName.toLowerCase() !== 'line' && !unfilled(style)) { return null; }
        var length = typeof el.getTotalLength === 'function' ? el.getTotalLength() : 0;
        var ctm = el.getScreenCTM();
        var svg = el.ownerSVGElement;
        if (!(length > 0) || !ctm || !svg) { return null; }
        var steps = Math.min(maxPoints, Math.ceil(length / 2));
        var points = [];
        for (var s = 0; s <= steps; s += 1) {
            var at = el.getPointAtLength((length * s) / steps);
            var screen = new DOMPoint(at.x, at.y).matrixTransform(ctm);
            if (!(isFinite(screen.x) && isFinite(screen.y))) { return null; }
            points.push([Math.round(screen.x * 10) / 10, Math.round(screen.y * 10) / 10]);
        }
        if (svgs.indexOf(svg) < 0) { svgs.push(svg); }
        var series = el.closest('[data-series]');
        var titleEl = el.querySelector('title');
        var label = snippet(el.getAttribute('aria-label') || (series && series.getAttribute('data-series'))
            || (titleEl && titleEl.textContent)) || legendFor(el, stroke, svg);
        return {
            dashed: style.strokeDasharray !== 'none',
            label: label,
            plotWidth: svg.getBoundingClientRect().width,
            points: points,
            stroke: stroke,
            svg: svgs.indexOf(svg),
        };
    };
    for (var i = 0; i < els.length && i < maxScan && lines.length < maxLines; i += 1) {
        var line = null;
        try { line = sample(els[i]); } catch (error) { line = null; }
        if (line) { lines.push(line); }
    }
    return lines;
}`;

import { seriesLinesSource } from './series-lines-source.ts';

/**
 * The in-frame geometry collector, as plain JavaScript source. It is a string
 * rather than a serialized TypeScript function so a transpiler can never
 * rename or hoist something it depends on. It only measures; `analyzeLayout`
 * (layout-probe.ts) decides what is a finding.
 */
export const layoutFactsSource = `function () {
    var maxBoxes = 600;
    var maxScan = 4000;
    var slop = 2;
    var skipTags = { SCRIPT: 1, STYLE: 1, TITLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
    // The sr-only pattern (a 1px box with overflow hidden or a clip, like the
    // hidden summary h2) is deliberately invisible, and so is all its text,
    // though checkVisibility still says it renders.
    var srOnly = function (el) {
        for (var node = el; node && node !== document.body; node = node.parentElement) {
            var nodeRect = node.getBoundingClientRect();
            if (nodeRect.width > 1 && nodeRect.height > 1) { continue; }
            var nodeStyle = getComputedStyle(node);
            if (nodeStyle.overflow !== 'visible' || nodeStyle.clipPath !== 'none' || nodeStyle.clip !== 'auto') {
                return true;
            }
        }
        return false;
    };
    var visible = function (el) {
        if (srOnly(el)) { return false; }
        if (typeof el.checkVisibility === 'function') {
            return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
        }
        var rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };
    var snippet = function (text) {
        var clean = String(text || '').replace(/\\s+/g, ' ').trim();
        return clean.length > 32 ? clean.slice(0, 31) + '…' : clean;
    };
    var describe = function (el) {
        var tag = el.tagName.toLowerCase();
        var name = tag;
        if (el.id) {
            name += '#' + el.id;
        } else if (el.classList && el.classList.length > 0) {
            name += '.' + el.classList[0];
        }
        if (el.namespaceURI === 'http://www.w3.org/2000/svg' && tag !== 'svg') {
            name = 'svg ' + name;
        }
        var text = snippet(el.textContent);
        return text ? name + ' "' + text + '"' : name;
    };
    var box = function (rect) {
        return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
    };
    var root = document.documentElement;
    var viewportWidth = root.clientWidth;
    var all = document.body ? document.body.getElementsByTagName('*') : [];

    var clippedByAncestor = function (el) {
        for (var node = el.parentElement; node && node !== document.body; node = node.parentElement) {
            if (getComputedStyle(node).overflowX !== 'visible') { return true; }
        }
        return false;
    };
    var overflowRoots = [];
    var clipCandidates = [];
    for (var i = 0; i < all.length && i < maxScan; i += 1) {
        var el = all[i];
        if (skipTags[el.tagName]) { continue; }
        var rect = el.getBoundingClientRect();
        var parentRect = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
        if (overflowRoots.length < 20 && rect.right > viewportWidth + slop
            && (!parentRect || parentRect.right <= viewportWidth + slop)
            && !clippedByAncestor(el)) {
            overflowRoots.push({ label: describe(el), right: rect.right });
        }
        if (!(el instanceof HTMLElement) || clipCandidates.length >= 40) { continue; }
        var style = getComputedStyle(el);
        var clips = function (value) { return value === 'hidden' || value === 'clip'; };
        if (!clips(style.overflowX) && !clips(style.overflowY)) { continue; }
        // Ellipsis and line clamps are deliberate truncation, not a bug.
        if (style.textOverflow === 'ellipsis' || (style.webkitLineClamp && style.webkitLineClamp !== 'none')) { continue; }
        if (!snippet(el.textContent) || !visible(el)) { continue; }
        clipCandidates.push({
            clientHeight: el.clientHeight,
            clientWidth: el.clientWidth,
            label: describe(el),
            scrollHeight: el.scrollHeight,
            scrollWidth: el.scrollWidth,
        });
    }

    var svgTexts = [];
    var textBoxes = [];
    var svgTextEls = document.querySelectorAll('svg text');
    for (var t = 0; t < svgTextEls.length && t < maxBoxes; t += 1) {
        var textEl = svgTextEls[t];
        if (!snippet(textEl.textContent) || !visible(textEl)) { continue; }
        var textRect = box(textEl.getBoundingClientRect());
        textBoxes.push({ label: describe(textEl), owner: textBoxes.length, rect: textRect });
        var svg = textEl.ownerSVGElement;
        if (svg && getComputedStyle(svg).overflow !== 'visible') {
            svgTexts.push({ label: describe(textEl), rect: textRect, svg: box(svg.getBoundingClientRect()) });
        }
    }

    var walker = document.createTreeWalker(document.body || root, NodeFilter.SHOW_TEXT);
    var owner = 100000;
    for (var node = walker.nextNode(); node && textBoxes.length < maxBoxes; node = walker.nextNode()) {
        var parent = node.parentElement;
        if (!parent || skipTags[parent.tagName] || !snippet(node.textContent)) { continue; }
        if (parent.closest('svg')) { continue; }
        if (!visible(parent)) { continue; }
        var range = document.createRange();
        range.selectNodeContents(node);
        var rects = range.getClientRects();
        owner += 1;
        var label = parent.tagName.toLowerCase() + ' "' + snippet(node.textContent) + '"';
        for (var r = 0; r < rects.length && textBoxes.length < maxBoxes; r += 1) {
            if (rects[r].width > 0 && rects[r].height > 0) {
                textBoxes.push({ label: label, owner: owner, rect: box(rects[r]) });
            }
        }
    }

    return {
        clipCandidates: clipCandidates,
        overflowRoots: overflowRoots,
        scrollWidth: root.scrollWidth,
        seriesLines: (${seriesLinesSource})(visible, snippet),
        svgTexts: svgTexts,
        textBoxes: textBoxes,
        viewportWidth: viewportWidth,
    };
}`;

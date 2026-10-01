import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guarded contract for the transcript's progressive edge blur, top and bottom.
 *
 * The bands sit over live transcript rows, so the ways they can go wrong are
 * all silent: taking the pointer swallows clicks and text selection on the
 * edge rows, painting a fixed colour shows a seam on a shell card, and losing
 * the `data-scrollable` gate draws the blur over the first or last message at
 * rest.
 */

const stylesDir = import.meta.dir;
const themeCss = readFileSync(join(stylesDir, 'default-theme.css'), 'utf8');
const chatCss = readFileSync(join(stylesDir, '../features/chats/chat.css'), 'utf8');
const shellCss = readFileSync(join(stylesDir, '../features/shell/shell.css'), 'utf8');
const scrollerTsx = readFileSync(
    join(stylesDir, '../components/chats/message-scroller.tsx'),
    'utf8'
);
const footerSurfaceTsx = readFileSync(
    join(stylesDir, '../features/chats/chat-footer-surface.tsx'),
    'utf8'
);

function ruleBody(css: string, selector: string) {
    // Whitespace-normalised, so a selector list wrapped across lines still matches.
    const flat = css.replace(/\s+/gu, ' ');
    const start = flat.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return flat.slice(start, flat.indexOf('}', start));
}

const base = () => ruleBody(themeCss, '.transcript-edge-blur');
const side = (name: 'top' | 'bottom') =>
    ruleBody(themeCss, `.transcript-edge-blur[data-side="${name}"]`);

describe('transcript edge blur contract', () => {
    test('the bands are inert and shown by visibility, never by animating opacity', () => {
        const band = base();
        expect(band).toContain('pointer-events: none;');
        expect(band).toContain('visibility: hidden;');
        for (const rule of [band, side('top'), side('bottom')]) {
            expect(rule).not.toContain('opacity');
            expect(rule).not.toContain('transition');
            expect(rule).not.toContain('animation');
        }
        // Top: only while scrolled past the start. Bottom: always, since at rest
        // it covers only the empty footer clearance.
        expect(themeCss.replace(/\s+/gu, ' ')).toContain(
            '[data-slot="message-scroller"][data-scrollable~="start"] > .transcript-edge-blur[data-side="top"], .transcript-edge-blur[data-side="bottom"] { visibility: visible; }'
        );
        expect(themeCss).not.toContain('data-scrollable~="end"');
    });

    test('the blur is a trace; the eased fade does the hiding', () => {
        const band = base();
        expect(band).toContain('--edge-blur: 1px;');
        expect(band).toContain('backdrop-filter: blur(var(--edge-blur));');
        expect(band).toContain(
            'rgb(0 0 0 / 0.65) calc(var(--edge-solid) + var(--edge-ramp) * 0.4)'
        );
    });

    test('each element carries its blur, fade mask, and wash together', () => {
        // A masked backdrop-filter on an element that paints nothing itself was
        // drawn unmasked by Electron's compositor: every band that is blurred
        // also paints its wash and masks itself, on the same element.
        const band = base();
        expect(band).toContain('background-color: var(--color-background);');
        expect(band).toContain('mask-image: var(--edge-fade);');
        expect(side('top')).toContain('--edge-fade-direction: to bottom;');
        expect(side('bottom')).toContain('--edge-fade-direction: to top;');
        expect(themeCss).not.toContain('.transcript-edge-blur__');
    });

    test('the bottom band covers the floating composer and stays under its dock', () => {
        // Solid from the bottom into the prompt input: no row may show beneath it.
        expect(side('bottom')).toContain(
            '--edge-solid: max(0px, calc(var(--chat-footer-height, 0px) - 3rem));'
        );
        const zIndex = (rule: string) => Number(/z-index: (\d+);/u.exec(rule)?.[1]);
        expect(zIndex(base())).toBeLessThan(zIndex(ruleBody(chatCss, '.chat-footer-dock')));
    });

    test('reduced transparency and forced colours drop the blur, keep the wash', () => {
        const media = themeCss.slice(
            themeCss.indexOf(
                '@media (prefers-reduced-transparency: reduce), (forced-colors: active) {'
            )
        );
        expect(ruleBody(media, '.transcript-edge-blur')).toContain('backdrop-filter: none;');
    });

    test('the edge blur replaced the old bottom fade and composer veil', () => {
        expect(scrollerTsx).not.toContain('scroll-fade-b');
        expect(chatCss).not.toContain('chat-footer-veil');
        expect(footerSurfaceTsx).not.toContain('chat-footer-veil');
    });

    test('every message scroller renders both bands, decoratively', () => {
        expect(scrollerTsx).toContain('<MessageScrollerEdgeBlur />');
        expect(scrollerTsx.match(/className="transcript-edge-blur"/gu)).toHaveLength(2);
        expect(scrollerTsx).toContain('data-side="top"');
        expect(scrollerTsx).toContain('data-side="bottom"');
        expect(scrollerTsx.match(/aria-hidden="true"/gu)?.length).toBeGreaterThanOrEqual(2);
    });

    test('the desktop window shell never rounds its clip', () => {
        // A rounded clip (border-radius or clip-path) on an ancestor made Chromium
        // drop the blur's mask in the desktop app: full-strength blur, hard cutoff.
        // macOS already clips the titled window to its own corner.
        const body = ruleBody(shellCss, 'html.macos-electron .app-window-shell');
        expect(body).not.toContain('border-radius');
        expect(body).not.toContain('clip-path');
    });
});

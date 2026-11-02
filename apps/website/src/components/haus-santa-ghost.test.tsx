import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HausGhost } from './haus-ghost.tsx';
import { GHOST_FIGURE } from './haus-ghost-figure.ts';
import { HausPumpkin } from './haus-pumpkin.tsx';
import { HausSantaGhost } from './haus-santa-ghost.tsx';
import { SANTA_GHOST_FIGURE, SANTA_PIECES } from './haus-santa-ghost-palette.ts';
import { SANTA_FRAME } from './haus-santa-ghost-paths.ts';

const iridescent = (props: { animated?: boolean } = {}) =>
    renderToStaticMarkup(<HausSantaGhost fill="iridescent" {...props} />);
const count = (markup: string, needle: string) => markup.split(needle).length - 1;

describe('Haus Santa ghost', () => {
    test('is the ghost itself under the hat: its own body, eyes and glass', () => {
        expect(SANTA_GHOST_FIGURE.body).toBe(GHOST_FIGURE.body);
        expect(SANTA_GHOST_FIGURE.eyes).toBe(GHOST_FIGURE.eyes);
        expect(SANTA_GHOST_FIGURE.blobs).toBe(GHOST_FIGURE.blobs);
        // One pair of eyes: the hat's pieces have none.
        expect(count(iridescent(), 'class="haus-ghost__eyes"')).toBe(1);
    });

    test('wears the hat as separate glass pieces, back to front over the ghost', () => {
        const markup = iridescent();
        const pieces = [...markup.matchAll(/<g class="haus-ghost__piece" transform="([^"]+)"/g)];

        expect(SANTA_PIECES.map((piece) => piece.id)).toEqual(['cone', 'brim', 'pom']);
        expect(pieces).toHaveLength(SANTA_PIECES.length);
        // The ghost's own stack comes first, so every piece paints over it.
        expect(markup.indexOf('haus-ghost__piece')).toBeGreaterThan(
            markup.indexOf('haus-ghost__eyes')
        );
        // Each piece is a whole glass stack of its own, so it has its own rim.
        expect(count(markup, 'class="haus-ghost__rim-color"')).toBe(1 + SANTA_PIECES.length);
        expect(count(markup, 'class="haus-ghost__edge"')).toBe(1 + SANTA_PIECES.length);
        SANTA_PIECES.forEach(({ place }, index) => {
            expect(pieces[index]?.[1]).toBe(
                `translate(${place.x} ${place.y}) scale(${place.scale})`
            );
        });
    });

    test('keeps the ghost’s rendered box and widens only the viewBox to fit the hat', () => {
        const santa = renderToStaticMarkup(<HausSantaGhost size={102} />);
        const ghost = renderToStaticMarkup(<HausGhost size={102} />);
        const box = (markup: string) => markup.match(/style="[^"]+"/)?.[0];
        const width = Math.round(192 * SANTA_FRAME.scale * 100) / 100;
        const height = Math.round(204 * SANTA_FRAME.scale * 100) / 100;

        expect(box(santa)).toBe(box(ghost));
        expect(santa).toContain(`viewBox="${SANTA_FRAME.x} ${SANTA_FRAME.y} ${width} ${height}"`);
        // The ghost and the pumpkin keep their own spans.
        expect(ghost).toContain('viewBox="0 0 192 204"');
        expect(renderToStaticMarkup(<HausPumpkin />)).toMatch(/viewBox="\S+ \S+ 192 204"/);
    });

    test('draws the hat into the solid silhouette too', () => {
        const solid = renderToStaticMarkup(<HausSantaGhost />);

        expect(count(solid, 'class="haus-ghost__body"')).toBe(1 + SANTA_PIECES.length);
        expect(solid).not.toContain('haus-ghost__piece');
    });

    test('drifts the ghost and holds the hat still', () => {
        const markup = iridescent({ animated: true });

        expect(markup).toContain('haus-ghost--animated');
        // The hat's blobs still carry their loop class; the CSS holds them.
        expect(count(markup, 'haus-ghost__blob--rose')).toBe(1 + SANTA_PIECES.length);
    });

    test('scopes every def to the instance and the piece, beside a ghost too', () => {
        const pair = renderToStaticMarkup(
            <>
                <HausSantaGhost fill="iridescent" />
                <HausSantaGhost fill="iridescent" />
                <HausGhost fill="iridescent" />
            </>
        );
        const ids = [...pair.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

        expect(new Set(ids).size).toBe(ids.length);
    });
});

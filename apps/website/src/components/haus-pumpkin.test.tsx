import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HausGhost } from './haus-ghost.tsx';
import { EYES_PATH } from './haus-ghost-paths.ts';
import { HausPumpkin } from './haus-pumpkin.tsx';
import { MARK_RIB, PUMPKIN_FORM, PUMPKIN_PATCHES } from './haus-pumpkin-form.ts';
import { PUMPKIN_GLASS } from './haus-pumpkin-palette.ts';
import {
    PUMPKIN_BODY_PATH,
    PUMPKIN_CENTRE_RIB_PATH,
    PUMPKIN_EYES_PATH,
    PUMPKIN_EYES_SCALE,
    PUMPKIN_FRAME,
} from './haus-pumpkin-paths.ts';

const iridescent = (props: { animated?: boolean } = {}) =>
    renderToStaticMarkup(<HausPumpkin fill="iridescent" {...props} />);
const numbers = (path: string) => [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe('Haus pumpkin', () => {
    test("takes the ghost's exact box, so it drops into every slot", () => {
        const pumpkin = renderToStaticMarkup(<HausPumpkin size={102} />);
        const ghost = renderToStaticMarkup(<HausGhost size={102} />);
        const box = (markup: string) => markup.match(/style="[^"]+"/)?.[0];
        const span = (markup: string) => markup.match(/viewBox="\S+ \S+ (\S+ \S+)"/)?.[1];

        expect(box(pumpkin)).toBe(box(ghost));
        expect(span(pumpkin)).toBe(span(ghost));
        expect(pumpkin).toContain('height:102px');
        expect(pumpkin).toContain('width:96px');
    });

    test('frames the artwork so its mass, not its stem-topped outline, centers in the box', () => {
        // Measured: the silhouette's area centroid is (94.3, 112.6) — the stem
        // fills the top of the box with almost no mass, so unframed the body
        // rode 1.1px low at 22px. The frame moves the viewBox so that centroid
        // lands on the box center (96, 102), where the row icons and gear sit.
        const centroid = { x: 94.3, y: 112.6 };

        expect(centroid.x - PUMPKIN_FRAME.x).toBeCloseTo(96, 0);
        expect(centroid.y - PUMPKIN_FRAME.y).toBeCloseTo(102, 0);
        expect(iridescent()).toContain(`viewBox="${PUMPKIN_FRAME.x} ${PUMPKIN_FRAME.y} 192 204"`);
        expect(renderToStaticMarkup(<HausGhost />)).toContain('viewBox="0 0 192 204"');
    });

    test("wears the ghost's own eyes: the same shapes, only scaled and moved", () => {
        const ghostEyes = numbers(EYES_PATH);
        const pumpkinEyes = numbers(PUMPKIN_EYES_PATH);

        expect(pumpkinEyes).toHaveLength(ghostEyes.length);
        expect(PUMPKIN_EYES_SCALE).toBeGreaterThan(0.75);
        // Every point keeps its offset from the first one, times one uniform
        // scale on both axes, so no eye is stretched, tilted or reshaped.
        pumpkinEyes.forEach((value, index) => {
            const origin = index % 2;
            expect(value - pumpkinEyes[origin]).toBeCloseTo(
                (ghostEyes[index] - ghostEyes[origin]) * PUMPKIN_EYES_SCALE,
                2
            );
        });
        expect(iridescent()).toContain('class="haus-ghost__eyes"');
    });

    test('is glass, not a flat fill: the same layered stack as the ghost', () => {
        const markup = iridescent();

        for (const layer of ['halo', 'interior', 'rim-color', 'rim-light', 'rim-core', 'edge']) {
            expect(markup).toContain(`haus-ghost__${layer}`);
        }
        // The ghost's three mesh blobs, plus the interior color patches.
        expect(markup.match(/<circle/g)).toHaveLength(3 + PUMPKIN_PATCHES.length);
        expect(markup).not.toContain('haus-ghost__body');
    });

    test('is a solid gourd: drifting interior color and form shading over it', () => {
        const markup = iridescent({ animated: true });
        const patches = markup.indexOf('haus-ghost__patches');
        const form = markup.indexOf('haus-ghost__form');

        expect(patches).toBeGreaterThan(markup.indexOf('haus-ghost__interior'));
        // Over the color, under the white light, so the speculars stay crisp.
        expect(form).toBeGreaterThan(markup.indexOf('haus-ghost__rim-color'));
        expect(form).toBeLessThan(markup.indexOf('haus-ghost__rim-light'));
        for (const paint of PUMPKIN_FORM) {
            expect(markup).toContain(`-form-${paint.id}`);
        }
        // The patches ride the drift loops like the mesh does.
        expect(markup.slice(patches, form)).toContain('haus-ghost__blob--');
        const ghost = renderToStaticMarkup(<HausGhost fill="iridescent" />);
        expect(ghost).not.toContain('haus-ghost__form');
        expect(ghost).not.toContain('haus-ghost__patches');
    });

    test('shades the centre crease like the outer creases', () => {
        const paint = (id: string) => PUMPKIN_FORM.find((p) => p.id === id);
        const outer = paint('crease-recess');
        const centre = paint('centre-recess');
        const rib = paint('centre-rib');

        expect(centre?.d).toBe(PUMPKIN_CENTRE_RIB_PATH);
        expect([centre?.width, centre?.blur, centre?.opacity]).toEqual([
            outer?.width,
            outer?.blur,
            outer?.opacity,
        ]);
        expect([rib?.width, rib?.blur, rib?.opacity]).toEqual([
            MARK_RIB.width,
            MARK_RIB.blur,
            MARK_RIB.opacity,
        ]);
        // It runs from the stem socket to the belly's centre dip.
        expect(PUMPKIN_BODY_PATH).toContain('98 180');
        expect(PUMPKIN_CENTRE_RIB_PATH.endsWith('98 180')).toBe(true);
    });

    test('retunes the mesh warm and glazes the stem green inside the glass', () => {
        const markup = iridescent();
        const clipIndex = markup.indexOf('<g clip-path=');

        for (const color of [
            PUMPKIN_GLASS.meshPeach,
            PUMPKIN_GLASS.meshOrange,
            PUMPKIN_GLASS.meshRose,
        ]) {
            expect(markup).toContain(color);
        }
        expect(markup).not.toContain('#00adff');
        expect(markup).toContain(PUMPKIN_GLASS.stemGreen);
        // Inside the body clip, so the glass rim and highlight still paint over it.
        expect(markup.indexOf('haus-ghost__tint')).toBeGreaterThan(clipIndex);
    });

    test("rides the ghost's drift loops, so the mesh moves the same way", () => {
        const markup = iridescent({ animated: true });

        expect(markup).toContain('haus-ghost--animated');
        for (const loop of ['azure', 'violet', 'rose']) {
            expect(markup).toContain(`haus-ghost__blob--${loop}`);
        }
    });

    test('scopes every def to the instance, beside a ghost too', () => {
        const pair = renderToStaticMarkup(
            <>
                <HausPumpkin fill="iridescent" />
                <HausGhost fill="iridescent" />
            </>
        );
        const ids = [...pair.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

        expect(new Set(ids).size).toBe(ids.length);
    });
});

import { describe, expect, test } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from './haus-ghost-paths.ts';
import { HausGhost } from './haus-ghost.tsx';

/**
 * What the mark's motion has to keep being: visible at 22px, bounded to the
 * icon's own arrangement, and close to free.
 *
 * The numbers quoted in these tests are mean per-channel RGB change over the
 * ghost's pixels across a three-second window, measured on the real sidebar row
 * in both themes, alongside the mark's share of a core over a five-second
 * window.
 */

const iridescent = () => renderToStaticMarkup(<HausGhost fill="iridescent" />);
const ghostCss = await Bun.file(new URL('./haus-ghost.css', import.meta.url)).text();
const MESH_IDS = ['azure', 'violet', 'rose'] as const;

describe('Haus ghost motion', () => {
    test('drifts the mesh only for the animated iridescent fill', () => {
        expect(renderToStaticMarkup(<HausGhost animated fill="iridescent" />)).toContain(
            'haus-ghost--animated'
        );
        expect(iridescent()).not.toContain('haus-ghost--animated');
        expect(renderToStaticMarkup(<HausGhost animated />)).not.toContain('haus-ghost--animated');
    });

    test('steps every loop onto one shared grid, so the mark repaints once for all three', () => {
        // The blobs drift inside a Gaussian blur nested in two masks and a
        // clip, so every distinct transform re-runs that filter chain on the
        // main thread. A continuous drift cost 10% of a core on every route.
        // What costs is the number of frames the mark redraws on, not how many
        // blobs moved in one, so the three periods are whole multiples of a
        // single step: break the alignment and the cost multiplies by three.
        const ticks = MESH_IDS.map((id) => {
            const rule = ghostCss.slice(
                ghostCss.indexOf(`.haus-ghost--animated .haus-ghost__blob--${id} {`)
            );
            const period = Number(rule.match(/animation-duration:\s*calc\(([\d.]+)s/)?.[1]);
            const steps = Number(
                rule.match(/animation-timing-function:\s*steps\((\d+),\s*end\)/)?.[1]
            );
            const segments = keyframeStops(id).length - 1;

            expect(period).toBeGreaterThan(0);
            expect(steps).toBeGreaterThan(0);
            return period / (segments * steps);
        });

        expect(ticks).toEqual([ticks[0], ticks[0], ticks[0]]);
        expect(ticks[0]).toBeLessThanOrEqual(0.5);
        expect(ghostCss).not.toContain('ease-in-out');
    });

    test('stops the drift when the window is not being looked at', () => {
        expect(ghostCss).toContain('html.window-blurred .haus-ghost--animated .haus-ghost__blob');
        expect(ghostCss.slice(ghostCss.indexOf('html.window-blurred'))).toContain(
            'animation-play-state: paused'
        );
        expect(ghostCss.slice(ghostCss.indexOf('@media (prefers-reduced-motion'))).toContain(
            'animation-play-state: paused'
        );
    });

    test('sweeps each blob far enough to see, and never out of its own quadrant', () => {
        // The drift is the only motion in the mark that is both visible and
        // affordable: measured on the 22px sidebar row it moves a mean 6.5 of
        // 255 per RGB channel over three seconds for 0.8% of a core, where the
        // loops it replaced moved 3.3 and read as still. It earns that from
        // reach — half the mark rather than a quarter — so a loop that shrinks
        // back toward the old extent is the regression to catch.
        //
        // The bound is the other half of the design. Wider loops were tried and
        // rejected: past about a hundred units of travel the rose crossed the
        // centre line and pooled in the left lobe, and the mark stopped reading
        // like the app icon at half its phases. Azure stays upper right and
        // rose stays on the lower-right contour at every phase, not just at
        // rest.
        const markup = iridescent();
        const blobs = Object.fromEntries(
            [...markup.matchAll(/haus-ghost__blob--(\w+)"[^>]*cx="([\d.]+)" cy="([\d.]+)"/g)].map(
                ([, id, cx, cy]) => [id, { cx: Number(cx), cy: Number(cy) }]
            )
        );
        const reach = (id: string) => {
            const stops = keyframeStops(id);
            const xs = stops.map((stop) => blobs[id].cx + stop.x);
            const ys = stops.map((stop) => blobs[id].cy + stop.y);
            return {
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys),
                left: Math.min(...xs),
                top: Math.min(...ys),
                bottom: Math.max(...ys),
            };
        };

        for (const id of MESH_IDS) {
            const loop = reach(id);
            expect(Math.max(loop.width, loop.height)).toBeGreaterThan(VIEWBOX_WIDTH * 0.4);
        }
        // Azure above the mark's waist and right of its centre line; rose below
        // that waist and right of the same line.
        expect(reach('azure').left).toBeGreaterThan(VIEWBOX_WIDTH / 2);
        expect(reach('azure').bottom).toBeLessThan(VIEWBOX_HEIGHT * 0.6);
        expect(reach('rose').left).toBeGreaterThan(VIEWBOX_WIDTH / 2);
        expect(reach('rose').top).toBeGreaterThan(VIEWBOX_HEIGHT * 0.6);
    });

    test('leaves the colored rim and its halo standing still', () => {
        // Breathing the rim's gradient stops was built and measured: it moved
        // the 22px mark by 0.9 of 255 per channel over three seconds and cost
        // 8.4% of a core, because changing a stop invalidates the paint server
        // and re-rasterizes every filter and mask in the mark. A blob opacity
        // swell measured 0.65 for 3.5%. The drift buys 6.5 for 0.8%, so the rim
        // is the stable thing the drift moves against — deliberately, not by
        // omission.
        const rim = ghostCss.slice(ghostCss.indexOf('.haus-ghost__rim-color'));

        expect(iridescent()).not.toContain('<animate');
        expect(rim.slice(0, rim.indexOf('}'))).not.toContain('animation');
        expect(ghostCss).not.toContain('haus-ghost__rim-stop');
        expect(ghostCss).not.toContain('fill-opacity: var(--haus-ghost-blob-peak)');
    });

    test('quickens the drift only when a lively tempo is asked for', () => {
        expect(
            renderToStaticMarkup(<HausGhost animated fill="iridescent" tempo="lively" />)
        ).toContain('haus-ghost--lively');
        expect(renderToStaticMarkup(<HausGhost animated fill="iridescent" />)).not.toContain(
            'haus-ghost--lively'
        );
    });
});

/** The translate offsets one drift loop passes through, keyframe by keyframe. */
function keyframeStops(id: string) {
    const block = ghostCss.slice(ghostCss.indexOf(`@keyframes haus-ghost-drift-${id} {`));

    return [
        ...block
            .slice(0, block.indexOf('\n}'))
            .matchAll(/translate\((-?[\d.]+)p?x?,\s*(-?[\d.]+)p?x?\)/g),
    ].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
}

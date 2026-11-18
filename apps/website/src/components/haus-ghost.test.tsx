import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HausGhost } from './haus-ghost.tsx';

const iridescent = () => renderToStaticMarkup(<HausGhost fill="iridescent" />);
const ghostCss = await Bun.file(new URL('./haus-ghost.css', import.meta.url)).text();
describe('Haus ghost', () => {
    test('punches the eyes out of a single tintable path when solid', () => {
        const markup = renderToStaticMarkup(<HausGhost />);

        expect(markup.match(/<path/g)).toHaveLength(1);
        expect(markup).toContain('fill-rule="evenodd"');
        expect(markup).toContain('fill="currentColor"');
        expect(markup).not.toContain('<circle');
    });

    test('clips every glass layer to the body and blurs them in user space', () => {
        const markup = iridescent();
        const clipId = markup.match(/<clipPath[^>]*\sid="([^"]+)"/)?.[1];

        expect(clipId).toBeTruthy();
        expect(markup).toContain(`clip-path="url(#${clipId})"`);
        // A bbox filter region would crop the blur off the drifting blobs.
        expect(markup.match(/filterUnits="userSpaceOnUse"/g)).toHaveLength(5);
        expect(markup).toContain('class="haus-ghost__eyes"');
    });

    test('draws the silhouette with a colored rim, not with a fill', () => {
        const markup = iridescent();
        const rimId = markup.match(/<linearGradient[^>]*\sid="([^"]*rim-color[^"]*)"/)?.[1];

        expect(rimId).toBeTruthy();
        expect(markup).toContain(`stroke="url(#${rimId})"`);
        expect(markup).toContain('#00baff');
        expect(markup).toContain('#ff43a6');
        // The rim is a stroke of the body path clipped back to it, so the mark
        // has no filled body at all beyond the interior tint.
        expect(markup).toContain('class="haus-ghost__rim-color"');
        expect(markup).not.toContain('class="haus-ghost__body"');
    });

    test('lets the theme decide how much light the interior scatters', () => {
        const markup = iridescent();
        const tint = markup.match(/<radialGradient[^>]*>(.*?)<\/radialGradient>/s)?.[1] ?? '';
        const stops = [...tint.matchAll(/stop-opacity:\s*var\((--[\w-]+)\)/g)].map((m) => m[1]);

        // The gradient carries only the run of offsets. Both the strength and
        // the falloff belong to the ground, so the theme owns both: a light
        // ground reads through nearly clear glass, a dark one has no ground to
        // read through and gets a near-flat white body instead of a gray one.
        expect(stops).toEqual([
            '--haus-ghost-scatter-peak',
            '--haus-ghost-scatter-mid',
            '--haus-ghost-scatter-outer',
        ]);
        expect(markup).toContain('class="haus-ghost__interior"');
        expect(ghostCss).toContain('fill-opacity: var(--haus-ghost-scatter)');
        expect(ghostCss).toContain('opacity: var(--haus-ghost-specular)');
    });

    test("fills the body with white on the app's own dark selector", () => {
        // Only the dark-ground rule itself: the pumpkin's own overrides further
        // down set the specular on purpose and are not about the ground.
        const darkStart = ghostCss.indexOf("[data-theme='dark'] .haus-ghost");
        const dark = ghostCss.slice(darkStart, ghostCss.indexOf('}', darkStart) + 1);
        const read = (css: string, variable: string) =>
            Number(css.match(new RegExp(`--haus-ghost-${variable}:\\s*([\\d.]+)`))?.[1]);

        expect(dark).toContain('.dark .haus-ghost');
        // On black the scatter is not a tint on a body the page already
        // filled — it *is* the body, so it has to be a near-solid white, and
        // near-flat out to the silhouette. A partial or falling-off scatter is
        // what read as a gray blob with colored edges.
        expect(read(dark, 'scatter')).toBeGreaterThan(0.9);
        for (const stop of ['mid', 'outer']) {
            expect(read(dark, `scatter-${stop}`)).toBeGreaterThan(0.9);
            expect(read(ghostCss, `scatter-${stop}`)).toBeLessThan(0.8);
        }
        // A white shape on near-black wants a colored bloom to sit in; the
        // highlight and outline were lifting a gray body and no longer are, so
        // they carry one value on both grounds.
        expect(read(dark, 'halo')).toBeGreaterThan(read(ghostCss, 'halo'));
        expect(dark).not.toContain('--haus-ghost-specular:');
        expect(dark).not.toContain('--haus-ghost-edge:');
    });

    test('outlines the mark in a gradient that samples the mesh, never in ink', () => {
        const markup = iridescent();
        const edgeId = markup.match(/<linearGradient[^>]*\sid="([^"]*-edge-[^"]*)"/)?.[1];
        const edge = markup.match(/<linearGradient[^>]*-edge-[^>]*>(.*?)<\/linearGradient>/s)?.[1];

        expect(edgeId).toBeTruthy();
        expect(markup).toContain(`class="haus-ghost__edge" d=`);
        expect(markup).toContain(`stroke="url(#${edgeId})"`);
        // Cool lavender-gray under the highlight, then the mesh colors down the
        // right and bottom: an outline catching light, not a hairline of ink.
        expect(edge).toContain('#8d92c5');
        expect(edge).toContain('#00baff');
        expect(edge).toContain('#ff43a6');
        expect(markup).not.toContain('#1a1630');
        expect(ghostCss).toContain('stroke-opacity: var(--haus-ghost-edge)');
    });

    test('lifts the mark off the ground with a colored halo outside the clip', () => {
        const markup = iridescent();
        const rimId = markup.match(/<linearGradient[^>]*\sid="([^"]*rim-color[^"]*)"/)?.[1];
        const clipIndex = markup.indexOf('<g clip-path=');
        const haloIndex = markup.indexOf('class="haus-ghost__halo"');

        expect(haloIndex).toBeGreaterThan(-1);
        // Outside the body clip and beneath every other layer, or it would be
        // an inner glow rather than the ground picking up the mark's color.
        expect(haloIndex).toBeLessThan(clipIndex);
        expect(markup).toContain(`class="haus-ghost__halo" d=`);
        expect(markup.slice(haloIndex)).toContain(`stroke="url(#${rimId})"`);
        expect(ghostCss).toContain('opacity: var(--haus-ghost-halo)');
    });

    test('lights the upper-left dome in white and leaves the color to the right', () => {
        const markup = iridescent();
        const domeId = markup.match(/<mask[^>]*\sid="([^"]*dome[^"]*)"/)?.[1];

        expect(domeId).toBeTruthy();
        expect(markup).toContain(`mask="url(#${domeId})"`);
        expect(markup).toContain('class="haus-ghost__rim-light"');
        expect(markup).toContain('class="haus-ghost__rim-core"');
        expect(markup.match(/class="haus-ghost__specular"/g)).toHaveLength(2);
    });

    test('drifts three blobs, weighted away from the upper left', () => {
        const markup = iridescent();
        const sideId = markup.match(/<mask[^>]*\sid="([^"]*side-mask[^"]*)"/)?.[1];

        expect(markup.match(/<circle/g)).toHaveLength(3);
        for (const color of ['#00adff', '#9539ff', '#ff43a6']) {
            expect(markup).toContain(color);
        }
        expect(sideId).toBeTruthy();
        expect(markup).toContain(`mask="url(#${sideId})"`);
    });

    test('arranges the color the way the app icon does', () => {
        const markup = iridescent();
        const blobs = Object.fromEntries(
            [...markup.matchAll(/haus-ghost__blob--(\w+)"([^>]*)/g)].map(([, id, attrs]) => [
                id,
                Object.fromEntries(
                    [...attrs.matchAll(/([\w-]+)="([\d.]+)"/g)].map(([, k, v]) => [k, Number(v)])
                ),
            ])
        );
        const rim = markup.match(
            /<linearGradient[^>]*rim-color[^>]*>(.*?)<\/linearGradient>/s
        )?.[1];
        const roseRun = [...(rim ?? '').matchAll(/offset="([\d.]+)" stop-color="#ff43a6"/g)].map(
            (m) => Number(m[1])
        );

        // Azure high and right, rose low and further right still, violet a
        // quiet transition between them rather than a region of its own.
        expect(blobs.azure.cy).toBeLessThan(blobs.violet.cy);
        expect(blobs.violet.cy).toBeLessThan(blobs.rose.cy);
        expect(blobs.rose.cx).toBeGreaterThan(blobs.violet.cx);
        expect(blobs.violet['fill-opacity']).toBeLessThan(blobs.azure['fill-opacity']);
        expect(blobs.violet['fill-opacity']).toBeLessThan(blobs.rose['fill-opacity']);
        // The rim gradient runs upper-right to lower-left, so its later half is
        // the lower-right contour: rose has to own a stretch of it, not a point.
        expect(roseRun).toHaveLength(2);
        expect(roseRun[1] - roseRun[0]).toBeGreaterThan(0.2);
    });

    test('scopes every def to the instance, so two marks never collide', () => {
        const pair = renderToStaticMarkup(
            <>
                <HausGhost fill="iridescent" />
                <HausGhost fill="iridescent" />
            </>
        );
        const ids = [...pair.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('names the mark for assistive tech, but never when it is decorative', () => {
        const labelled = renderToStaticMarkup(<HausGhost />);
        const decorative = renderToStaticMarkup(<HausGhost aria-hidden="true" />);

        expect(labelled).toContain('<title>Haus</title>');
        expect(labelled).toContain('role="img"');
        // `aria-hidden` hides the mark from assistive tech but not from the
        // browser's own `<title>` tooltip, so the title has to go with it.
        expect(decorative).not.toContain('<title>');
        expect(decorative).not.toContain('role="img"');
    });

    test('sizes by height and keeps the 192:204 aspect', () => {
        const markup = renderToStaticMarkup(<HausGhost size={102} />);

        expect(markup).toContain('height:102px');
        expect(markup).toContain('width:96px');
    });
});

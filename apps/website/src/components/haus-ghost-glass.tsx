/**
 * The faux-glass stack that fills the iridescent mark — the ghost, or the
 * pumpkin it wears for Halloween. The stack is one; the figure supplies the
 * silhouette, the eyes, and the colors tuned to them (`haus-ghost-figure.ts`).
 *
 * The mark is a piece of thick, translucent glass, not a painted sticker. What
 * draws the shape is the rim: light entering a thick body piles up where the
 * surface turns away from the viewer, which is why a glass object is hollow in
 * the middle and luminous around its silhouette.
 *
 * How much light the interior scatters depends on the ground, the way it does
 * in the app icon — on a dark tile the body reads pale and luminous, not as a
 * hole cut in the sidebar. On a light page that scatter is a whisper over a
 * body the page has already filled; on a near-black one it *is* the body, so
 * it turns into a near-solid, near-flat fill. The CSS owns both the strength
 * and the falloff, in `--haus-ghost-scatter` and its three stops.
 *
 * A soft colored halo sits outside the silhouette, then four layers clipped to
 * the body, painted back to front:
 *
 *   1. the interior scatter, a radial in the figure's interior color that the
 *      theme scales — white for the ghost, pale flesh for the pumpkin — with
 *      a solid figure's drifting color patches, any tinted region (the
 *      pumpkin's stem) and rib grooves glazed over it;
 *   2. the drifting color mesh, weighted to the right and bottom and pushed
 *      toward the edge, so the upper left stays nearly clear;
 *   3. a colored inner glow tracing the whole silhouette — the layer that
 *      keeps the mark legible on a light ground, where white cannot — then a
 *      solid figure's form shading (`haus-ghost-form.tsx`);
 *   4. a white inner glow over the upper-left dome only — a soft bloom, a hot
 *      line inside it, and two specular spots: the highlight that sells the
 *      curvature on a dark ground.
 *
 * Every glow is a blurred stroke of the body path clipped back to the body —
 * an inner glow follows the silhouette exactly, where a radial gradient would
 * band on a shape this asymmetric.
 *
 * The outline and the eyes are drawn last and outside the clip, on purpose.
 * The outline is a non-scaling hairline in a gradient that walks the same
 * colors the mesh does — never ink and never one color — and a stroke clipped
 * to its own path keeps only its inner half, which is a hairline of half the
 * weight sitting inside the silhouette rather than on it. The eyes are opaque
 * marks on top of the glass, not something it tints.
 */

import type { GlassFigure } from './haus-ghost-figure.ts';
import { GlassForm, GlassPatches } from './haus-ghost-form.tsx';
import { type GhostGlassIds, GlassDefs } from './haus-ghost-glass-defs.tsx';
import { GLASS } from './haus-ghost-palette.ts';
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from './haus-ghost-paths.ts';

export function HausGhostGlass({ figure, ids }: { figure: GlassFigure; ids: GhostGlassIds }) {
    const body = figure.body;

    return (
        <>
            <GlassDefs figure={figure} ids={ids} />
            {/* Outside the clip, under everything: the ground picking up the
                mark's own color, which is what lifts it off both a white page
                and a near-black sidebar. */}
            <path
                className="haus-ghost__halo"
                d={body}
                fill="none"
                filter={`url(#${ids.haloBlur})`}
                stroke={`url(#${ids.rimColor})`}
            />
            <g clipPath={`url(#${ids.clip})`}>
                <rect
                    className="haus-ghost__interior"
                    fill={`url(#${ids.interior})`}
                    height={VIEWBOX_HEIGHT}
                    width={VIEWBOX_WIDTH}
                    x="0"
                    y="0"
                />
                <GlassPatches figure={figure} ids={ids} />
                {figure.ribs ? (
                    <path
                        className="haus-ghost__ribs"
                        d={figure.ribs.path}
                        fill="none"
                        filter={`url(#${ids.lightBlur})`}
                        stroke={figure.ribs.color}
                    />
                ) : null}
                {figure.tint ? (
                    <rect
                        className="haus-ghost__tint"
                        clipPath={`url(#${ids.tintClip})`}
                        fill={`url(#${ids.tint})`}
                        height={VIEWBOX_HEIGHT}
                        width={VIEWBOX_WIDTH}
                        x="0"
                        y="0"
                    />
                ) : null}
                <g mask={`url(#${ids.sideMask})`}>
                    <g mask={`url(#${ids.rimMask})`}>
                        <g filter={`url(#${ids.meshBlur})`}>
                            {figure.blobs.map((blob) => (
                                <circle
                                    className={`haus-ghost__blob haus-ghost__blob--${blob.drift}`}
                                    cx={blob.cx}
                                    cy={blob.cy}
                                    fill={blob.color}
                                    fillOpacity={blob.opacity}
                                    key={blob.id}
                                    r={blob.r}
                                />
                            ))}
                        </g>
                    </g>
                    <path
                        className="haus-ghost__rim-color"
                        d={body}
                        fill="none"
                        filter={`url(#${ids.rimBlur})`}
                        stroke={`url(#${ids.rimColor})`}
                    />
                </g>
                <GlassForm figure={figure} ids={ids} />
                <g mask={`url(#${ids.domeMask})`}>
                    <path
                        className="haus-ghost__rim-light"
                        d={body}
                        fill="none"
                        filter={`url(#${ids.lightBlur})`}
                        stroke={GLASS.highlight}
                    />
                    {/* The hot line inside the bloom. A thick edge of glass
                        catches a hard highlight, not a wash — without this the
                        soft glow alone just fogs the interior. */}
                    <path
                        className="haus-ghost__rim-core"
                        d={body}
                        fill="none"
                        filter={`url(#${ids.coreBlur})`}
                        stroke={GLASS.highlight}
                    />
                </g>
                {figure.speculars.map((spot) => (
                    <ellipse
                        className="haus-ghost__specular"
                        cx={spot.cx}
                        cy={spot.cy}
                        fill={GLASS.highlight}
                        // `fill-opacity`, not `opacity`: the CSS rule owns the
                        // layer's strength, and this is the spot's share of it.
                        fillOpacity={spot.weight}
                        filter={`url(#${ids.lightBlur})`}
                        key={spot.cx}
                        rx={spot.rx}
                        ry={spot.ry}
                        transform={`rotate(${spot.angle} ${spot.cx} ${spot.cy})`}
                    />
                ))}
            </g>
            <path className="haus-ghost__edge" d={body} fill="none" stroke={`url(#${ids.edge})`} />
            <path className="haus-ghost__eyes" d={figure.eyes} fill={figure.eye} />
        </>
    );
}

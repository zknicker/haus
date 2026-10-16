/**
 * A figure is everything the glass stack needs to know about one mark: its
 * silhouette, its eyes, and the colors and placements tuned to that shape. The
 * glass itself — the layer order, the blurs, the masks, the drift — is shared,
 * so the ghost and the Halloween pumpkin are one character in two costumes
 * rather than two pieces of artwork that drift apart.
 */

import { EDGE_STOPS, GLASS, RIM_COLOR_STOPS } from './haus-ghost-palette.ts';
import { BODY_PATH, EYES_PATH } from './haus-ghost-paths.ts';

export interface GlassFigure {
    blobs: readonly MeshBlob[];
    /** The silhouette every layer clips to and every rim strokes. */
    body: string;
    edgeStops: readonly { color: string; offset: number; opacity: number }[];
    eye: string;
    eyes: string;
    /** Form shading painted over the color mesh and under the white light:
        core shadow, lobe crowns, occlusion, bounce, a stem's cylinder. A
        solid figure needs it; the ghost is see-through glass and has none. */
    form?: readonly FormPaint[];
    /** Where the 192×204 viewBox starts, so a figure whose mass does not sit
        where its outline's box does can still center optically in every slot
        without the rendered box changing. The ghost's is the origin. */
    frame?: { x: number; y: number };
    /** Drifting color patches painted straight onto the interior, outside the
        rim mask: color moving through an opaque body rather than pooled at a
        glass rim. The ghost has none. */
    patches?: readonly MeshBlob[];
    /** Soft grooves inside the glass, like a pumpkin's ribs. */
    ribs?: { color: string; path: string };
    rimStops: readonly { color: string; offset: number }[];
    /** The interior scatter: one color per `SCATTER_PROFILE` stop, core to
        silhouette, and where its radial sits. White throughout for the ghost;
        cream warming to orange for the pumpkin. */
    scatter: {
        colors: readonly [string, string, string];
        cx: number;
        cy: number;
        r: number;
    };
    speculars: readonly Specular[];
    /** An extra region glazed in its own color inside the glass, like a stem. */
    tint?: {
        path: string;
        stops: readonly { color: string; offset: number }[];
        y1: number;
        y2: number;
    };
}

/** A form paint shape of `FORM_BODY` stands for the figure's own silhouette,
    so a paint can trace a body the icon fillets and the mark does not. */
export const FORM_BODY = 'BODY';

export interface FormStop {
    color: string;
    offset: number;
    opacity: number;
}

/** A gradient in the mark's own user space. */
export type FormGradient =
    | { kind: 'linear'; stops: readonly FormStop[]; x1: number; x2: number; y1: number; y2: number }
    | { kind: 'radial'; cx: number; cy: number; r: number; stops: readonly FormStop[] };

/** One shading pass: a shape filled or stroked with a flat color or a
    gradient, optionally blurred. Clipped to the body like every glass layer. */
export interface FormPaint {
    blur: number;
    d: string;
    /** Stable, per figure; scopes the paint's defs. */
    id: string;
    mode: 'fill' | 'stroke';
    opacity: number;
    paint: FormGradient | string;
    /** Stroke weight, for `mode: 'stroke'`. */
    width?: number;
}

/** `drift` names the shared loop in `haus-ghost.css` the blob rides. */
export interface MeshBlob {
    color: string;
    cx: number;
    cy: number;
    drift: 'azure' | 'violet' | 'rose';
    id: string;
    opacity: number;
    r: number;
}

export interface Specular {
    angle: number;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    weight: number;
}

export const GHOST_FIGURE: GlassFigure = {
    body: BODY_PATH,
    eyes: EYES_PATH,
    eye: GLASS.eye,
    scatter: {
        colors: [GLASS.highlight, GLASS.highlight, GLASS.highlight],
        cx: 70,
        cy: 76,
        r: 140,
    },
    rimStops: RIM_COLOR_STOPS,
    edgeStops: EDGE_STOPS,
    /* Azure at the upper right, rose along the lower-right contour, and only a
       soft violet where the two would otherwise mix to gray — the icon's
       arrangement. Each blob is wide enough to cross the silhouette so its
       color wraps the edge rather than stopping short of it, and the rose sits
       far enough out that the body keeps its inner falloff and the edge keeps
       the rest: on the icon the red hugs the lower-right silhouette, it does
       not pool in the middle. Violet is the quietest of the three on purpose;
       raising it is what turned the mark purple. */
    blobs: [
        {
            id: 'azure',
            drift: 'azure',
            color: GLASS.meshAzure,
            cx: 154,
            cy: 68,
            r: 50,
            opacity: 0.78,
        },
        {
            id: 'violet',
            drift: 'violet',
            color: GLASS.meshViolet,
            cx: 110,
            cy: 142,
            r: 39,
            opacity: 0.66,
        },
        {
            id: 'rose',
            drift: 'rose',
            color: GLASS.meshRose,
            cx: 163,
            cy: 187,
            r: 42,
            opacity: 0.74,
        },
    ],
    /* Measured off the icon: a long streak about a third across and a sixth
       down the body, lying along the dome's upper-left arc, with a shorter one
       trailing below it. Two spots, at different angles, are what stop the
       dome from reading as an evenly lit ball. */
    speculars: [
        { cx: 62, cy: 40, rx: 24, ry: 7.5, angle: -40, weight: 1 },
        { cx: 44, cy: 74, rx: 11, ry: 5, angle: -66, weight: 0.6 },
    ],
};

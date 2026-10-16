/**
 * The pumpkin's volume: the form shading and interior color that turn a flat
 * orange silhouette into a round, satin-glazed gourd lit from the upper left.
 * Shared verbatim by the in-app mark and the app icon's mesh, in the mark's
 * own user space (the 192×204 box, before `PUMPKIN_FRAME`).
 *
 * Lobes, left to right: the outer left lobe (x 2–50), the broad centre lobe
 * (50–146) with the eyes on it (x 85–143, y 82–126), and the outer right lobe
 * (146–189). The crown meets the stem around y 48–55.
 */

import { FORM_BODY, type FormPaint, type FormStop, type MeshBlob } from './haus-ghost-figure.ts';
import { PUMPKIN_RIBS_PATH, PUMPKIN_STEM_PATH } from './haus-pumpkin-paths.ts';

const EMBER = '#b8340a';
const UMBER = '#6e2406';
const CROWN_LIGHT = '#ffe4b4';
const BOUNCE = '#ffb27a';
const STEM_LIGHT = '#d9f08c';
const STEM_DARK = '#1f3006';

/** Covers the whole box; the body clip gives it the silhouette. */
const FIELD = 'M-40 -40H240V250H-40z';

/** Soft, drifting color inside the opaque body: amber high on the left,
    orange low on the left, coral under the eyes and a little rose at the lower
    right. Not see-through, just the glaze's color moving. Each rides one of
    the ghost's drift loops, and none crosses the face, so the eyes keep a calm
    ground. */
export const PUMPKIN_PATCHES: readonly MeshBlob[] = [
    { id: 'amber', drift: 'azure', color: '#ffb02e', cx: 52, cy: 78, r: 32, opacity: 0.75 },
    { id: 'ember', drift: 'violet', color: '#ff5a14', cx: 30, cy: 150, r: 32, opacity: 0.7 },
    { id: 'coral', drift: 'rose', color: '#ff6a4e', cx: 112, cy: 160, r: 32, opacity: 0.7 },
    { id: 'magenta', drift: 'azure', color: '#ff3f8a', cx: 166, cy: 150, r: 24, opacity: 0.45 },
];

export const PUMPKIN_FORM: readonly FormPaint[] = [
    /* Core shadow: the body turning away from an upper-left light. Clear over
       the lit half, rolling off to ember across the right third and the
       belly. */
    {
        id: 'core-shadow',
        d: FIELD,
        mode: 'fill',
        blur: 0,
        opacity: 1,
        paint: {
            kind: 'radial',
            cx: 64,
            cy: 66,
            r: 150,
            stops: ramp(EMBER, [
                [0, 0],
                [0.5, 0],
                [0.74, 0.26],
                [1, 0.5],
            ]),
        },
    },
    /* Each lobe's crown catches the light: a soft lift on its upper-left
       swell, so the three read as separate rounded forms. The right lobe is on
       the shadow side and takes the least. */
    crown('crown-left', 24, 98, 26, 0.5),
    crown('crown-centre', 80, 86, 40, 0.42),
    crown('crown-right', 160, 96, 22, 0.24),
    /* Recess at the outer creases, where the lobes press together. */
    {
        id: 'crease-recess',
        d: PUMPKIN_RIBS_PATH,
        mode: 'stroke',
        width: 16,
        blur: 6,
        opacity: 0.36,
        paint: EMBER,
    },
    /* The centre lobe's own two creases: lower contrast, and faded out where
       they pass behind the eyes so the face stays the focal point. */
    {
        id: 'centre-creases',
        d: 'M78 54C68 92 68 140 76 182M118 54C128 92 128 140 120 182',
        mode: 'stroke',
        width: 10,
        blur: 5,
        opacity: 0.22,
        paint: {
            kind: 'linear',
            x1: 0,
            y1: 50,
            x2: 0,
            y2: 185,
            stops: ramp(EMBER, [
                [0, 1],
                [0.16, 1],
                [0.25, 0],
                [0.58, 0],
                [0.68, 1],
                [1, 1],
            ]),
        },
    },
    /* Contact shadow under the crown, where the stem sinks into it. */
    {
        id: 'crown-occlusion',
        d: ellipse(98, 56, 30, 9),
        mode: 'fill',
        blur: 4,
        opacity: 0.32,
        paint: UMBER,
    },
    /* Bounce light: a thin warm line just inside the right and bottom
       silhouette, the ground lighting the shadow side. The body clip keeps
       only the stroke's inner half. */
    {
        id: 'bounce',
        d: FORM_BODY,
        mode: 'stroke',
        width: 6,
        blur: 1.2,
        opacity: 0.7,
        paint: {
            kind: 'linear',
            x1: 50,
            y1: 50,
            x2: 180,
            y2: 190,
            stops: ramp(BOUNCE, [
                [0, 0],
                [0.55, 0],
                [0.8, 0.8],
                [1, 1],
            ]),
        },
    },
    /* The stem as a smooth satin cylinder: a soft lift on its lit left side,
       a mid-tone, and a darker right side, across its leaning axis. No stripe
       and no ridges, so it matches the body's glaze. */
    {
        id: 'stem-cylinder',
        d: PUMPKIN_STEM_PATH,
        mode: 'fill',
        blur: 0,
        opacity: 1,
        paint: {
            kind: 'linear',
            x1: 80,
            y1: 36,
            x2: 117,
            y2: 47,
            stops: [
                { offset: 0, color: STEM_LIGHT, opacity: 0.32 },
                { offset: 0.38, color: STEM_LIGHT, opacity: 0 },
                { offset: 0.52, color: STEM_DARK, opacity: 0 },
                { offset: 1, color: STEM_DARK, opacity: 0.6 },
            ],
        },
    },
    /* Where the stem enters the crown. */
    {
        id: 'stem-occlusion',
        d: ellipse(98, 52.5, 20, 3.5),
        mode: 'fill',
        blur: 2,
        opacity: 0.45,
        paint: UMBER,
    },
];

function crown(id: string, cx: number, cy: number, r: number, strength: number): FormPaint {
    return {
        id,
        d: ellipse(cx, cy, r, r),
        mode: 'fill',
        blur: 0,
        opacity: strength,
        paint: {
            kind: 'radial',
            cx,
            cy,
            r,
            stops: ramp(CROWN_LIGHT, [
                [0, 1],
                [0.5, 0.5],
                [1, 0],
            ]),
        },
    };
}

function ramp(color: string, stops: readonly [number, number][]): FormStop[] {
    return stops.map(([offset, opacity]) => ({ color, offset, opacity }));
}

function ellipse(cx: number, cy: number, rx: number, ry: number) {
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}z`;
}

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

import {
    FORM_BODY,
    type FormGradient,
    type FormPaint,
    type FormStop,
    type MeshBlob,
} from './haus-ghost-figure.ts';
import {
    PUMPKIN_CENTRE_RIB_PATH,
    PUMPKIN_RIBS_PATH,
    PUMPKIN_STEM_PATH,
} from './haus-pumpkin-paths.ts';

/** A step deeper than the orange flesh, so the lobe creases still read on an
    opaque body. */
export const PUMPKIN_RIB = '#e2531a';

/**
 * How much the centre crease eases where it runs behind the left eye, from 0
 * to 1. At 0 it matches the outer creases end to end; at 0.3 it keeps 70% of
 * their strength behind the eyes, so the face keeps a little clean ground.
 */
export const CENTRE_CREASE_EYE_EASE = 0;

/** Where the ease sits, in y: the left eye spans y 82–126 over the crease, so
    the ease holds across it and ramps back to full strength over 12 units
    either side. Offsets are along a vertical ramp from `y1` to `y2`. */
export const CENTRE_CREASE_EASE_SPAN = {
    y1: 50,
    top: 74,
    holdTop: 86,
    holdBottom: 124,
    bottom: 136,
    y2: 185,
} as const;

/** How one surface strokes its outer ribs, so the centre crease can match. */
export interface RibStroke {
    readonly blur: number;
    readonly opacity: number;
    readonly width: number;
}

/** The mark's outer ribs: `.haus-ghost__ribs` in `haus-ghost.css` (width 12,
    opacity 0.65) under the glass's light blur (5). */
export const MARK_RIB: RibStroke = { blur: 5, opacity: 0.65, width: 12 };

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

/**
 * The form for a surface whose outer ribs are stroked as `rib`. The centre
 * crease repeats both layers the outer creases get: that surface's rib stroke
 * first, under the light, then the same ember recess.
 */
export function pumpkinForm(rib: RibStroke): readonly FormPaint[] {
    return [
        {
            id: 'centre-rib',
            d: PUMPKIN_CENTRE_RIB_PATH,
            mode: 'stroke',
            width: rib.width,
            blur: rib.blur,
            opacity: rib.opacity,
            paint: easedBehindEyes(PUMPKIN_RIB),
        },
        ...FORM_UNDER_RECESS,
        {
            id: 'centre-recess',
            d: PUMPKIN_CENTRE_RIB_PATH,
            mode: 'stroke',
            width: CREASE_RECESS.width,
            blur: CREASE_RECESS.blur,
            opacity: CREASE_RECESS.opacity,
            paint: easedBehindEyes(EMBER),
        },
        ...FORM_OVER_RECESS,
    ];
}

/** Recess at the outer creases, where the lobes press together. */
const CREASE_RECESS = {
    id: 'crease-recess',
    d: PUMPKIN_RIBS_PATH,
    mode: 'stroke',
    width: 16,
    blur: 6,
    opacity: 0.36,
    paint: EMBER,
} as const satisfies FormPaint;

const FORM_UNDER_RECESS: readonly FormPaint[] = [
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
    CREASE_RECESS,
];

const FORM_OVER_RECESS: readonly FormPaint[] = [
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

/** The in-app mark's form. The icon mesh builds its own from `pumpkinForm`
    with its stronger crease stroke. */
export const PUMPKIN_FORM = pumpkinForm(MARK_RIB);

function easedBehindEyes(color: string): FormGradient | string {
    if (CENTRE_CREASE_EYE_EASE === 0) {
        return color;
    }
    const span = CENTRE_CREASE_EASE_SPAN;
    const at = (y: number) => Math.round(((y - span.y1) / (span.y2 - span.y1)) * 1000) / 1000;
    const eased = 1 - CENTRE_CREASE_EYE_EASE;
    return {
        kind: 'linear',
        x1: 0,
        y1: span.y1,
        x2: 0,
        y2: span.y2,
        stops: ramp(color, [
            [0, 1],
            [at(span.top), 1],
            [at(span.holdTop), eased],
            [at(span.holdBottom), eased],
            [at(span.bottom), 1],
            [1, 1],
        ]),
    };
}

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

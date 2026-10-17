/**
 * The ghost's glass, re-tuned for Halloween and matched to the chosen Codex
 * render: the same layer stack and arrangement — a pale luminous core, color
 * leaning right and down, white light on the upper left — with azure, violet
 * and rose swapped for peach, orange and a warm rose. The scatter that fills
 * the body goes from white to a pale cream, so the pumpkin keeps the ghost's
 * glowing middle and wears its color at the rim.
 */

import type { GlassFigure } from './haus-ghost-figure.ts';
import { GLASS } from './haus-ghost-palette.ts';
import { PUMPKIN_FORM, PUMPKIN_PATCHES, PUMPKIN_RIB } from './haus-pumpkin-form.ts';
import {
    PUMPKIN_BODY_PATH,
    PUMPKIN_EYES_PATH,
    PUMPKIN_FRAME,
    PUMPKIN_RIBS_PATH,
    PUMPKIN_STEM_PATH,
} from './haus-pumpkin-paths.ts';

export const PUMPKIN_GLASS = {
    flesh: '#fff0d8',
    apricot: '#ffb25a',
    flank: '#ff7f24',
    edgeWarm: '#f0c49a',
    peach: '#ffbe4a',
    orange: '#ff7f36',
    rose: '#ff4a7c',
    roseLight: '#ff8a6a',
    meshPeach: '#ffc640',
    meshOrange: '#ff5a2a',
    meshRose: '#ff3f78',
    rib: PUMPKIN_RIB,
    stemGreen: '#86c043',
    stemOlive: '#5f7f22',
} as const;

export const PUMPKIN_FIGURE: GlassFigure = {
    body: PUMPKIN_BODY_PATH,
    eyes: PUMPKIN_EYES_PATH,
    eye: GLASS.eye,
    /* The silhouette centroid sits at (94.3, 112.6): the stem fills the top of
       the box with almost no mass, so the body rode 1.1px low at 22px against
       the gear and row midline. Starting the viewBox here puts the centroid on
       the box center (96, 102), where the row icons and the gear center. */
    frame: PUMPKIN_FRAME,
    form: PUMPKIN_FORM,
    patches: PUMPKIN_PATCHES,
    /* A solid gourd, opaque on every ground (the CSS pins the scatter to 1):
       a cream highlight in the center lobe's middle, amber across the rest of
       it, and deep orange through the outer lobes. */
    scatter: {
        colors: [PUMPKIN_GLASS.flesh, PUMPKIN_GLASS.apricot, PUMPKIN_GLASS.flank],
        /* Up and left of center, toward the light: a lit surface, not a glow
           from inside. */
        cx: 92,
        cy: 88,
        r: 104,
    },
    ribs: { path: PUMPKIN_RIBS_PATH, color: PUMPKIN_GLASS.rib },
    /* Orange owns the rim; rose is only a late accent low on the contour. */
    rimStops: [
        { offset: 0, color: PUMPKIN_GLASS.peach },
        { offset: 0.32, color: PUMPKIN_GLASS.orange },
        { offset: 0.7, color: PUMPKIN_GLASS.orange },
        { offset: 0.88, color: PUMPKIN_GLASS.rose },
        { offset: 1, color: PUMPKIN_GLASS.roseLight },
    ],
    edgeStops: [
        { offset: 0, color: PUMPKIN_GLASS.edgeWarm, opacity: 0.9 },
        { offset: 0.38, color: PUMPKIN_GLASS.peach, opacity: 1 },
        { offset: 0.68, color: PUMPKIN_GLASS.orange, opacity: 1 },
        { offset: 1, color: PUMPKIN_GLASS.rose, opacity: 1 },
    ],
    /* Peach high on the right outer lobe, rose low on it, and orange warming
       the left lobe's lower half, as the render has them. Each rides one of
       the ghost's own drift loops. */
    blobs: [
        {
            id: 'peach',
            drift: 'azure',
            color: PUMPKIN_GLASS.meshPeach,
            cx: 152,
            cy: 74,
            r: 48,
            opacity: 0.6,
        },
        {
            id: 'orange',
            drift: 'violet',
            color: PUMPKIN_GLASS.meshOrange,
            cx: 36,
            cy: 150,
            r: 44,
            opacity: 0.85,
        },
        {
            id: 'rose',
            drift: 'rose',
            color: PUMPKIN_GLASS.meshRose,
            cx: 160,
            cy: 156,
            r: 46,
            /* A blush, not a band: rose stays the accent on a solid orange body. */
            opacity: 0.55,
        },
    ],
    /* A streak on each upper-left shoulder: the left outer lobe's and the
       center lobe's, which is what makes the lobes read as separate curves. */
    speculars: [
        { cx: 26, cy: 80, rx: 18, ry: 6, angle: -60, weight: 1 },
        { cx: 66, cy: 72, rx: 16, ry: 5, angle: -46, weight: 0.85 },
    ],
    tint: {
        path: PUMPKIN_STEM_PATH,
        y1: 14,
        y2: 60,
        stops: [
            { offset: 0, color: PUMPKIN_GLASS.stemGreen },
            { offset: 0.65, color: PUMPKIN_GLASS.stemOlive },
            { offset: 1, color: PUMPKIN_GLASS.stemOlive },
        ],
    },
};

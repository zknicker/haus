/**
 * The ghost's Christmas costume, matched to the chosen Codex render: the
 * ghost itself, unchanged, under a nightcap whose three pieces are each their
 * own satin glass, solid like the pumpkin rather than see-through like the
 * ghost, so the hat sits on the head instead of showing it through.
 *
 * The cone is cherry glass with a coral highlight high on its shoulder and
 * deep crimson down the droop, its rim warming to rose where the ghost's own
 * rim turns rose. The brim and pom-pom are the ghost's white glass with the
 * ghost's own azure, violet and rose edge, so they read as part of the same
 * character. Every coordinate below is in the piece's own 192×204 box.
 */

import { FORM_BODY, GHOST_FIGURE, type GlassFigure, type GlassPiece } from './haus-ghost-figure.ts';
import { EDGE_STOPS, GLASS, RIM_COLOR_STOPS } from './haus-ghost-palette.ts';
import {
    SANTA_BRIM_PATH,
    SANTA_CONE_PATH,
    SANTA_FRAME,
    SANTA_PLACE,
    SANTA_POM_PATH,
} from './haus-santa-ghost-paths.ts';

export const SANTA_GLASS = {
    coral: '#ff6a55',
    cherry: '#ee1c33',
    crimson: '#a0072a',
    meshCoral: '#ff4d3d',
    meshCrimson: '#c4002e',
    meshRose: '#ff2f6d',
    rimPeach: '#ff7a66',
    rimCherry: '#ff2238',
    rimRose: '#ff1f5a',
    rimPink: '#ff5c8f',
    shadow: '#5a0014',
    /** The white pieces' scatter: the ghost's white, cooling a touch at the
        silhouette so a solid body still turns. */
    snow: '#ffffff',
    frost: '#f7f5ff',
    lilac: '#efedfb',
    /** Soft cool shading under a white piece's roll. */
    dusk: '#6f72a6',
} as const;

const CONE: GlassFigure = {
    body: SANTA_CONE_PATH,
    eye: GLASS.eye,
    scatter: {
        colors: [SANTA_GLASS.coral, SANTA_GLASS.cherry, SANTA_GLASS.crimson],
        cx: 92,
        cy: 52,
        r: 150,
    },
    rimStops: [
        { offset: 0, color: SANTA_GLASS.rimPeach },
        { offset: 0.35, color: SANTA_GLASS.rimCherry },
        { offset: 0.7, color: SANTA_GLASS.rimRose },
        { offset: 1, color: SANTA_GLASS.rimPink },
    ],
    edgeStops: [
        { offset: 0, color: '#ffb0a3', opacity: 0.9 },
        { offset: 0.4, color: SANTA_GLASS.rimCherry, opacity: 1 },
        { offset: 0.75, color: SANTA_GLASS.rimRose, opacity: 1 },
        { offset: 1, color: SANTA_GLASS.rimPink, opacity: 1 },
    ],
    /* Coral on the right shoulder, crimson in the middle of the droop, rose
       where the droop meets the pom-pom. */
    blobs: [
        {
            id: 'coral',
            drift: 'azure',
            color: SANTA_GLASS.meshCoral,
            cx: 160,
            cy: 60,
            r: 46,
            opacity: 0.7,
        },
        {
            id: 'crimson',
            drift: 'violet',
            color: SANTA_GLASS.meshCrimson,
            cx: 60,
            cy: 150,
            r: 44,
            opacity: 0.7,
        },
        {
            id: 'rose',
            drift: 'rose',
            color: SANTA_GLASS.meshRose,
            cx: 30,
            cy: 180,
            r: 40,
            opacity: 0.75,
        },
    ],
    /* Deepens the far side of the cone and the end of the droop, so it reads
       as a soft cylinder lit from the upper left, and creases it where the
       droop folds over the back of the head. */
    form: [
        {
            id: 'fold',
            d: 'M50 56C38 70 30 95 24 136',
            mode: 'stroke',
            width: 16,
            blur: 6,
            opacity: 0.4,
            paint: SANTA_GLASS.shadow,
        },
        {
            id: 'core-shadow',
            d: FORM_BODY,
            mode: 'fill',
            blur: 0,
            opacity: 1,
            paint: {
                kind: 'radial',
                cx: 90,
                cy: 50,
                r: 190,
                stops: [
                    { offset: 0, color: SANTA_GLASS.shadow, opacity: 0 },
                    { offset: 0.5, color: SANTA_GLASS.shadow, opacity: 0 },
                    { offset: 0.78, color: SANTA_GLASS.shadow, opacity: 0.3 },
                    { offset: 1, color: SANTA_GLASS.shadow, opacity: 0.5 },
                ],
            },
        },
    ],
    /* A long streak along the upper-left shoulder and a short one below it. */
    speculars: [
        { cx: 70, cy: 50, rx: 26, ry: 7, angle: -32, weight: 1 },
        { cx: 40, cy: 92, rx: 10, ry: 5, angle: -65, weight: 0.55 },
    ],
};

/** The brim and pom-pom: the ghost's glass, made solid. */
const whitePiece = (
    body: string,
    blobs: GlassFigure['blobs'],
    speculars: GlassFigure['speculars']
): GlassFigure => ({
    body,
    eye: GLASS.eye,
    scatter: {
        colors: [SANTA_GLASS.snow, SANTA_GLASS.frost, SANTA_GLASS.lilac],
        cx: 70,
        cy: 64,
        r: 165,
    },
    rimStops: RIM_COLOR_STOPS,
    edgeStops: EDGE_STOPS,
    blobs,
    form: [
        {
            id: 'roll',
            d: FORM_BODY,
            mode: 'fill',
            blur: 0,
            opacity: 1,
            paint: {
                kind: 'radial',
                cx: 80,
                cy: 62,
                r: 165,
                stops: [
                    { offset: 0, color: SANTA_GLASS.dusk, opacity: 0 },
                    { offset: 0.55, color: SANTA_GLASS.dusk, opacity: 0 },
                    { offset: 0.85, color: SANTA_GLASS.dusk, opacity: 0.12 },
                    { offset: 1, color: SANTA_GLASS.dusk, opacity: 0.22 },
                ],
            },
        },
    ],
    speculars,
});

/* Azure on the brim's raised right end, rose under its low left end. */
const BRIM = whitePiece(
    SANTA_BRIM_PATH,
    [
        {
            id: 'azure',
            drift: 'azure',
            color: GLASS.meshAzure,
            cx: 176,
            cy: 100,
            r: 44,
            opacity: 0.55,
        },
        {
            id: 'violet',
            drift: 'violet',
            color: GLASS.meshViolet,
            cx: 120,
            cy: 150,
            r: 36,
            opacity: 0.3,
        },
        { id: 'rose', drift: 'rose', color: GLASS.meshRose, cx: 30, cy: 150, r: 44, opacity: 0.6 },
    ],
    [
        { cx: 70, cy: 72, rx: 28, ry: 6.5, angle: -18, weight: 1 },
        { cx: 28, cy: 98, rx: 10, ry: 4.5, angle: -52, weight: 0.55 },
    ]
);

/* Rose pooling low on the ball, as it does under the ghost. */
const POM = whitePiece(
    SANTA_POM_PATH,
    [
        {
            id: 'azure',
            drift: 'azure',
            color: GLASS.meshAzure,
            cx: 160,
            cy: 70,
            r: 46,
            opacity: 0.45,
        },
        {
            id: 'violet',
            drift: 'violet',
            color: GLASS.meshViolet,
            cx: 120,
            cy: 160,
            r: 38,
            opacity: 0.3,
        },
        { id: 'rose', drift: 'rose', color: GLASS.meshRose, cx: 60, cy: 170, r: 46, opacity: 0.6 },
    ],
    [
        { cx: 60, cy: 50, rx: 24, ry: 9, angle: -40, weight: 1 },
        { cx: 38, cy: 88, rx: 9, ry: 4.5, angle: -66, weight: 0.5 },
    ]
);

/** Back to front: the cone, then the brim over its base, then the pom-pom
    over the end of its droop. */
export const SANTA_PIECES: readonly GlassPiece[] = [
    { id: 'cone', figure: CONE, place: SANTA_PLACE.cone },
    { id: 'brim', figure: BRIM, place: SANTA_PLACE.brim },
    { id: 'pom', figure: POM, place: SANTA_PLACE.pom },
];

export const SANTA_GHOST_FIGURE: GlassFigure = {
    ...GHOST_FIGURE,
    frame: SANTA_FRAME,
    pieces: SANTA_PIECES,
};

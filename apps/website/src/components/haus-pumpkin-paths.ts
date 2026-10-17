/**
 * The Halloween pumpkin, drawn in the ghost's own 192×204 box so it drops into
 * every slot the ghost fills with no layout shift.
 *
 * Traced from the chosen Codex render (`.context/halloween-mocks/mascot`):
 * three front lobes — a broad center lobe flanked by two taller outer lobes —
 * with notches where they meet under the belly and a soft dip at its center,
 * and a short stem that hooks left. One closed outline, stem included, so the
 * glass rim traces the whole silhouette without a seam at the stem.
 */

import { EYES_PATH } from './haus-ghost-paths.ts';

const STEM = [
    // Up the stem's left flank, under the hook, round its tip, over the top,
    // and down the right flank into the socket.
    'M79 52C80 44 80 38 79 33',
    'C76 31 72 33 69 33',
    'C63 33 62 25 67 22',
    'C74 15 92 13 100 20',
    'C108 27 112 38 117 52',
];

export const PUMPKIN_BODY_PATH = [
    ...STEM,
    // The center lobe's crown, then the right outer lobe: a sloped shoulder,
    // widest below the middle, round under it into the belly notch.
    'C124 48 131 48 137 52',
    'C152 48 174 58 182 82',
    'C192 108 194 150 172 170',
    'C164 177 153 178 147 173',
    // The belly: the center lobe's two halves meeting at a soft dip.
    'C142 186 110 190 98 180',
    'C86 190 54 186 49 173',
    // The left outer lobe, mirrored, and back over the crown to the stem.
    'C43 178 32 177 22 170',
    'C0 150 -2 110 8 86',
    'C14 64 32 49 55 52',
    'C62 48 72 48 79 52z',
].join(' ');

/** The stem alone, for its green glaze: the whole stem down to the socket,
    closed by a shallow arc a few units into the crown so the joint has no
    straight seam. The glaze stays olive to the arc; nothing orange shows on
    the stem itself. */
export const PUMPKIN_STEM_PATH = `${STEM.join(' ')}C108 56 88 56 79 52z`;

/** The creases where the center lobe meets the outer lobes, bowing out with it. */
export const PUMPKIN_RIBS_PATH = 'M137 52C152 90 154 140 147 173M55 52C42 90 40 140 49 173';

/** The center lobe's one crease, where its two halves meet: from the stem
    socket straight down to the soft dip in the belly at x 98. It passes behind
    the left eye. */
export const PUMPKIN_CENTRE_RIB_PATH = 'M98 56C97 94 97 142 98 180';

/** Where the pumpkin's viewBox starts: it moves the artwork 1.7 right and 10.6
    up inside the unchanged 192×204 box, which puts the silhouette's centroid
    (body minus eyes, measured by area) on the box center. */
export const PUMPKIN_FRAME = { x: -1.7, y: 10.6 } as const;

/** The ghost's eye pair's center, which the costume's eyes are placed by. */
export const GHOST_EYES_CENTER = { x: 121.5, y: 76.1 } as const;

/** The ghost's own eyes — the same shapes, at the render's slightly smaller
    scale against the wider body — placed just right of center on the face, so
    it reads as the same character in costume. */
export const PUMPKIN_EYES_SCALE = 0.84;
export const PUMPKIN_EYES_PATH = placeAbsolutePath(EYES_PATH, PUMPKIN_EYES_SCALE, 113.6, 104);

/** Scales a path made only of absolute x,y pairs (M, L, C, z) about the
    ghost's eye center, then moves that center to `x`, `y`. */
function placeAbsolutePath(path: string, scale: number, x: number, y: number) {
    let index = 0;
    return path.replace(/-?\d+(?:\.\d+)?/g, (value) => {
        const isX = index % 2 === 0;
        index += 1;
        const from = isX ? GHOST_EYES_CENTER.x : GHOST_EYES_CENTER.y;
        const to = isX ? x : y;
        return String(Math.round((to + (Number(value) - from) * scale) * 1000) / 1000);
    });
}

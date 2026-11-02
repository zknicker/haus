/**
 * The Christmas nightcap the ghost wears: a red cone, a white brim and a
 * pom-pom, each its own piece of glass over the unchanged ghost.
 *
 * Traced from the chosen Codex render (the "nightcap" concept): the brim rolls
 * across the crown well above the eyes, tilting up to the right; the cone's
 * mass sits over the upper left and droops down the back of the head; the
 * pom-pom hangs beside the head at about eye height. Outlines are in the
 * ghost's own space (`haus-ghost-paths.ts`), so the hat reads against the
 * ghost exactly; each piece then draws in its own 192×204 box
 * (`GlassPiece`), so `intoPiece` moves the outline into that box.
 *
 * Every outline is absolute x,y pairs (M, C, z) only, which is what lets
 * `intoPiece` move it pair by pair.
 */

/** Up the right shoulder from under the brim, over the top, down the back
    of the head to the pom-pom, and back up its inner edge to tuck under the
    brim's left end. The base runs inside the brim, so no seam shows. */
const CONE = [
    'M146 4',
    'C143 -10 135 -20 124 -28.5',
    'C112 -37 98 -40 86 -39.5',
    'C70 -38.5 52 -31 38 -16',
    'C25 -2 15 18 11.5 40',
    'C9.5 52 9.5 62 11 70',
    'C14 76 22 80 30 75',
    'C31 70 32 66 33 62',
    'C48 34 90 10 146 4z',
].join(' ');

/** A rolled band: rising left to right along its top, round at both ends,
    and its underside about 26 units from its top all the way along. Its
    underside clears the eyes' tops by ~25 units. */
const BRIM = [
    'M33.9 32.9',
    'C40 23 52 12 68 5',
    'C84 -2 104 -6 126 -8.4',
    'C140 -9.5 151 -7 156 -3',
    'C161 1 162 15 157 21',
    'C150 25 140 20 126 19.2',
    'C106 18.5 86 23 68 31',
    'C52 38 42 49 37 61.5',
    'C34 65 29 61 30 54',
    'C30.4 46 30.8 38 33.9 32.9z',
].join(' ');

/** A ball of radius 22 centered at (12.5, 93), four quarter arcs at the
    0.5523 kappa. */
const POM = [
    'M-9.5 93',
    'C-9.5 80.85 0.35 71 12.5 71',
    'C24.65 71 34.5 80.85 34.5 93',
    'C34.5 105.15 24.65 115 12.5 115',
    'C0.35 115 -9.5 105.15 -9.5 93z',
].join(' ');

/** Where each piece's box lands in the ghost's space, sized so the piece
    spans its box about as the ghost spans its own. */
export const SANTA_PLACE = {
    cone: { scale: 0.74, x: 6.7, y: -55.5 },
    brim: { scale: 0.7, x: 28.1, y: -43.6 },
    pom: { scale: 0.235, x: -10.06, y: 69.03 },
} as const;

export const SANTA_CONE_PATH = intoPiece(CONE, SANTA_PLACE.cone);
export const SANTA_BRIM_PATH = intoPiece(BRIM, SANTA_PLACE.brim);
export const SANTA_POM_PATH = intoPiece(POM, SANTA_PLACE.pom);

/** The hat reaches ~40 units above the box and ~10 left of it, so the frame
    widens the viewBox 1.25x and moves its corner to fit the hat and its glow
    in; the rendered box is still the ghost's. The silhouette's centroid
    (ghost and hat, minus the eyes, measured by area) is (93.3, 85.4): it
    lands on the widened box's center across, and 1.9 units below it, ~0.16px
    at 22px. Centering it exactly would need 1.27x, and a smaller ghost, to
    clear the hat's top. */
export const SANTA_FRAME = { scale: 1.25, x: -26.7, y: -44 } as const;

/** Moves an outline from the ghost's space into a piece's own box. */
function intoPiece(path: string, place: { scale: number; x: number; y: number }) {
    let index = 0;
    return path.replace(/-?\d+(?:\.\d+)?/g, (value) => {
        const origin = index % 2 === 0 ? place.x : place.y;
        index += 1;
        return String(Math.round(((Number(value) - origin) / place.scale) * 100) / 100);
    });
}

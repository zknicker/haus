/**
 * Renders `assets/halloween-icon.icon/Assets/mesh-gradient.png`, the Halloween
 * icon's color layer: the in-app pumpkin's own glass — its silhouette, blobs,
 * rim ramp, lobe creases and stem glaze — through the same mesh pipeline the
 * ghost icon uses, so the two icons share every blur, mask and veil.
 *
 *   bun scripts/render-icon-mesh-pumpkin.ts      (from apps/website)
 */

import { fileURLToPath } from 'node:url';
import type { FormPaint } from '../src/components/haus-ghost-figure.ts';
import {
    PUMPKIN_PATCHES,
    pumpkinForm,
    type RibStroke,
} from '../src/components/haus-pumpkin-form.ts';
import { PUMPKIN_FIGURE, PUMPKIN_GLASS } from '../src/components/haus-pumpkin-palette.ts';
import { PUMPKIN_BODY_PATH, PUMPKIN_RIBS_PATH } from '../src/components/haus-pumpkin-paths.ts';
import { type IconProfile, type MeshBlob, renderIconMesh } from './render-icon-mesh.ts';

/**
 * The pumpkin at the ghost icon's own pixel density (8.27px per mark unit), on
 * a canvas with a 120px margin. Icon Composer places it at the ghost mesh's
 * 0.48 scale, so one mark unit is the same size on both tiles.
 */
const PUMPKIN_FOOTPRINT = {
    canvas: { height: 1646, width: 1786 },
    content: { bottom: 1526, left: 120, right: 1667, top: 120 },
} as const;

/* The glass lifts the stem toward lime, so the icon paints it a step darker
   than the component's olive. */
const STEM_DEEP = '#3f5a14';

/* At 1024 the mark's stem meets the crown at a hard notch on each side, which
   reads as cut out. The icon swaps each notch for a small fillet: the crown
   curve stops about six units short of the stem, then rounds up into its flank. */
const STEM_FILLETS: readonly [string, string][] = [
    ['M79 52C80 44 80 38 79 33', 'M73 49.5C77 50.5 79.5 48 79.6 44C80 39 79.5 36 79 33'],
    [
        'C108 27 112 38 117 52 C124 48 131 48 137 52',
        'C108 27 111.5 36 115.6 44C116.8 48 119 50.5 123 49.5C128 48.5 132 49 137 52',
    ],
    ['C62 48 72 48 79 52z', 'C62 48 68 48 73 49.5z'],
];

/** The mark's silhouette with the stem filleted into the crown. */
export const PUMPKIN_ICON_BODY_PATH = STEM_FILLETS.reduce(
    (path, [from, to]) => replaceOnce(path, from, to),
    PUMPKIN_BODY_PATH
);

/* The glaze is a block over the whole stem and both fillets. It overshoots the
   stem everywhere it meets air, so the body clip trims those edges and the
   feather only softens its bottom: a shallow arc just under the socket that
   follows the fillets into the crown. Beside the fillets it stops at y 47,
   above the crown's highest point (about 49.3), so it never reaches the lobes. */
const STEM_GLAZE_PATH = 'M40 0L160 0L160 47L123 47L123 49.5C120 55 76 55 73 49.5L73 47L40 47z';
const GLAZE_Y = { y1: 14, y2: 52 } as const;
/* About 5pt on the tile: a short blend at the joint, no orange on the stem. */
const GLAZE_FEATHER = 1.2;

/* The tile's soft-light shell lifts the mesh toward peach, so past the cream
   highlight the base ramp runs a step deeper than the component's amber and
   flank to land on the same solid orange. */
const BASE_AMBER = '#ffa040';
const BASE_ORANGE = '#ff6a1a';
const BASE_EMBER = '#ee4c0c';

/* Deep creases where the lobes meet, the outer two and the centre one alike. */
const ICON_RIB: RibStroke = { blur: 5, opacity: 0.95, width: 11 };

const ICON_TERMINATOR: FormPaint = {
    id: 'icon-terminator',
    d: 'M-40 -40H240V250H-40z',
    mode: 'fill',
    blur: 0,
    opacity: 1,
    paint: {
        kind: 'linear',
        x1: 96,
        y1: 70,
        x2: 192,
        y2: 170,
        stops: [
            { offset: 0, color: '#a82c06', opacity: 0 },
            { offset: 0.45, color: '#a82c06', opacity: 0.12 },
            { offset: 1, color: '#a82c06', opacity: 0.5 },
        ],
    },
};

/* The component's blobs, minus its drift-loop names. */
const PUMPKIN_BLOBS: readonly MeshBlob[] = PUMPKIN_FIGURE.blobs.map(
    ({ color, cx, cy, id, opacity, r }) => ({ color, cx, cy, id, opacity, r })
);

/**
 * A solid, satin-glazed gourd rather than the ghost's see-through glass: an
 * opaque orange body lit cream from the upper left, rose only as a blush low
 * on the right, a faint veil, deep creases where the lobes meet so the body
 * reads as three curves, and the stem's green glaze. The icon.json pairs this
 * with no blur material and quieter refraction.
 */
export const PUMPKIN_ICON_PROFILE: IconProfile = {
    blobOverrides: {
        peach: { color: '#ff9a1e', opacity: 0.8 },
        orange: { color: '#ff4e14', opacity: 1, r: 52 },
        rose: { color: '#ff2a5e', opacity: 0.55, r: 50 },
    },
    figure: {
        base: {
            colors: [PUMPKIN_GLASS.flesh, BASE_AMBER, BASE_ORANGE, BASE_EMBER],
            cx: 92,
            cy: 88,
            r: 104,
        },
        blobs: PUMPKIN_BLOBS,
        body: PUMPKIN_ICON_BODY_PATH,
        creases: { path: PUMPKIN_RIBS_PATH, color: PUMPKIN_GLASS.rib, ...ICON_RIB },
        footprint: PUMPKIN_FOOTPRINT,
        /* The mark's own volume and interior color, so the tile and the
           sidebar shade the same gourd, with the centre crease at the icon's
           own rib stroke, plus a terminator: the tile's soft-light shell lifts
           shadows the sidebar mark keeps, so the icon deepens its right third
           and belly once more. */
        form: pumpkinForm(ICON_RIB).flatMap((paint) =>
            paint.id === 'core-shadow' ? [paint, ICON_TERMINATOR] : [paint]
        ),
        patches: PUMPKIN_PATCHES.map(({ color, cx, cy, id, opacity, r }) => ({
            color,
            cx,
            cy,
            id,
            opacity,
            r,
        })),
        glaze: {
            feather: GLAZE_FEATHER,
            path: STEM_GLAZE_PATH,
            ...GLAZE_Y,
            stops: [
                { offset: 0, color: PUMPKIN_GLASS.stemOlive },
                { offset: 0.55, color: STEM_DEEP },
                { offset: 1, color: STEM_DEEP },
            ],
        },
    },
    core: null,
    edgeVeil: {
        width: 31,
        blur: 13,
        opacity: 0.1,
        axis: { x1: 40, y1: 50, x2: 170, y2: 185 },
    },
    rimOpacity: 0.7,
    rimStops: PUMPKIN_FIGURE.rimStops.map(({ color, offset }) => ({ color, offset })),
};

const OUT_PATH = fileURLToPath(
    new URL('../../../assets/halloween-icon.icon/Assets/mesh-gradient.png', import.meta.url)
);

function replaceOnce(path: string, from: string, to: string) {
    if (path.split(from).length !== 2) {
        throw new Error(`pumpkin icon fillet: expected exactly one "${from}" in the body path`);
    }
    return path.replace(from, to);
}

if (import.meta.main) {
    const written = await renderIconMesh({
        outPath: process.argv[2] ?? OUT_PATH,
        profile: PUMPKIN_ICON_PROFILE,
    });
    console.log(`[haus] pumpkin icon mesh rendered to ${written}`);
}

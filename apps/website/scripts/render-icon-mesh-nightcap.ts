/**
 * The Christmas icon's nightcap pieces as icon mesh profiles: each piece's own
 * glass from the in-app mark (`haus-santa-ghost-palette.ts`) — its outline,
 * blobs, rim and form shading — plus the few numbers the tile needs on top.
 * `render-icon-mesh-christmas.ts` places them on the ghost.
 */

import type { GlassPiece } from '../src/components/haus-ghost-figure.ts';
import { SANTA_GLASS } from '../src/components/haus-santa-ghost-palette.ts';
import { type EdgeVeil, ICON_PROFILE, type IconProfile, type RimStop } from './render-icon-mesh.ts';
import type { MeshFootprint } from './render-icon-mesh-figure.ts';

/** The tile-only numbers for one piece. Everything else is the mark's. */
interface PieceTuning {
    /** `null` keeps the mark's interior ramp. */
    readonly base: readonly string[] | null;
    /** Scales every blob's opacity. */
    readonly blobOpacity: number;
    readonly edgeVeil: EdgeVeil | null;
    readonly rimOpacity: number;
    /** `null` keeps the piece's own rim ramp. */
    readonly rimStops: readonly RimStop[] | null;
}

/* The white pieces wear the ghost icon's own rim ramp, so on the tile the brim
   and pom-pom are the same glass as the ghost under them, but at a fraction of
   its strength: a rim and a mesh that read as an edge on the big body flood a
   thin roll or a small ball edge to edge. */
const BRIM: PieceTuning = {
    base: null,
    blobOpacity: 0.45,
    edgeVeil: null,
    rimOpacity: 0.32,
    rimStops: ICON_PROFILE.rimStops,
};
const POM: PieceTuning = { ...BRIM, blobOpacity: 0.6, rimOpacity: 0.4 };

/* The cone is solid cherry glass, rimmed like the pumpkin. The tile crops its
   crown, so the coral highlight the mark keeps on the shoulder would be most
   of what shows, and the tile's glass lifts red toward salmon besides: the
   icon's ramp starts a step past cherry and deepens to crimson, and Icon
   Composer's own specular does the lighting. */
const CONE: PieceTuning = {
    base: ['#f51a2e', '#d80a26', SANTA_GLASS.crimson],
    blobOpacity: 1,
    edgeVeil: { width: 31, blur: 13, opacity: 0.1, axis: { x1: 40, y1: 50, x2: 170, y2: 185 } },
    rimOpacity: 0.7,
    rimStops: null,
};

const PIECE_TUNING: Readonly<Record<string, PieceTuning>> = { brim: BRIM, cone: CONE, pom: POM };

/** One piece's icon profile, laid on `footprint`. */
export function nightcapProfile(piece: GlassPiece, footprint: MeshFootprint): IconProfile {
    const tuning = PIECE_TUNING[piece.id];
    if (!tuning) {
        throw new Error(`christmas icon: no tuning for the ${piece.id} piece`);
    }
    const { blobs, body, form, rimStops, scatter } = piece.figure;

    return {
        blobOverrides: {},
        core: null,
        edgeVeil: tuning.edgeVeil,
        figure: {
            base: {
                colors: tuning.base ?? scatter.colors,
                cx: scatter.cx,
                cy: scatter.cy,
                r: scatter.r,
            },
            /* The mark's blobs, minus their drift-loop names. */
            blobs: blobs.map(({ color, cx, cy, id, opacity, r }) => ({
                color,
                cx,
                cy,
                id,
                opacity: opacity * tuning.blobOpacity,
                r,
            })),
            body,
            creases: null,
            footprint,
            form: form ?? [],
            glaze: null,
            patches: [],
        },
        rimOpacity: tuning.rimOpacity,
        rimStops: (tuning.rimStops ?? rimStops).map(({ color, offset }) => ({ color, offset })),
    };
}

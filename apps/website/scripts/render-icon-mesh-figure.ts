/**
 * A non-ghost figure for the icon mesh (`render-icon-mesh.ts`): its own
 * silhouette, radial base, glaze, creases and form shading, emitted as SVG
 * strings. The ghost icon leaves `IconProfile.figure` unset and never reaches
 * this module.
 */

import type { FormPaint } from '../src/components/haus-ghost-figure.ts';
import type { MeshBlob, RimStop } from './render-icon-mesh.ts';
import { formDefs, formPaints } from './render-icon-mesh-form.ts';

/** Where the silhouette lands on the layer canvas, in pixels. */
export interface MeshFootprint {
    readonly canvas: { readonly height: number; readonly width: number };
    readonly content: {
        readonly bottom: number;
        readonly left: number;
        readonly right: number;
        readonly top: number;
    };
}

/** A radial fill under the blobs, in place of the ghost's flat white. */
export interface MeshBase {
    readonly colors: readonly string[];
    readonly cx: number;
    readonly cy: number;
    readonly r: number;
}

/** A colored glaze over one region of the body, such as the pumpkin's stem. */
export interface MeshGlaze {
    /** Blur on the glaze shape, so it blends into the body instead of ending
        at a line. Let the shape overshoot the silhouette: the body clip trims
        the outside, so only the edge that lies inside the body goes soft. */
    readonly feather: number;
    readonly path: string;
    readonly stops: readonly RimStop[];
    readonly y1: number;
    readonly y2: number;
}

/** Soft colored creases, such as the pumpkin's lobe seams. */
export interface MeshCreases {
    readonly blur: number;
    readonly color: string;
    readonly opacity: number;
    readonly path: string;
    readonly width: number;
}

/** The figure an icon mesh is painted for. The ghost leaves this unset. */
export interface MeshFigure {
    readonly base: MeshBase;
    readonly blobs: readonly MeshBlob[];
    readonly body: string;
    readonly creases: MeshCreases | null;
    readonly footprint: MeshFootprint;
    /** Form shading over everything else, shared with the in-app mark. */
    readonly form: readonly FormPaint[];
    readonly glaze: MeshGlaze | null;
    /** Color painted straight onto the interior, outside the rim mask. */
    readonly patches: readonly MeshBlob[];
}

/* A figure's own paint servers: its radial base, its glaze ramp and its
   crease blur. `filterRegion` is the mesh's shared blur region attributes. */
export function figureDefs(figure: MeshFigure, filterRegion: string): string {
    const { base, glaze, creases } = figure;
    const baseStops = base.colors
        .map(
            (color, index) =>
                `<stop offset="${index / (base.colors.length - 1)}" stop-color="${color}"/>`
        )
        .join('');
    return `<radialGradient id="figure-base" gradientUnits="userSpaceOnUse" cx="${base.cx}" cy="${base.cy}" r="${base.r}">${baseStops}</radialGradient>${
        glaze
            ? `<linearGradient id="figure-glaze" gradientUnits="userSpaceOnUse" x1="0" y1="${glaze.y1}" x2="0" y2="${glaze.y2}">${glaze.stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join('')}</linearGradient><filter id="figure-glaze-feather" ${filterRegion}><feGaussianBlur stdDeviation="${glaze.feather}"/></filter>`
            : ''
    }${
        creases
            ? `<filter id="figure-crease-blur" ${filterRegion}><feGaussianBlur stdDeviation="${creases.blur}"/></filter>`
            : ''
    }${formDefs(figure.form)}`;
}

/* Creases first, so the glaze stays clean where the stem meets the crown;
   form shading last, over both. */
export function figureOverlays(figure: MeshFigure): string {
    const { creases, glaze } = figure;
    return `${
        creases
            ? `<path d="${creases.path}" fill="none" stroke="${creases.color}" stroke-width="${creases.width}" stroke-linecap="round" opacity="${creases.opacity}" filter="url(#figure-crease-blur)"/>`
            : ''
    }${glaze ? `<path d="${glaze.path}" fill="url(#figure-glaze)" filter="url(#figure-glaze-feather)"/>` : ''}${formPaints(figure.form, figure.body)}`;
}

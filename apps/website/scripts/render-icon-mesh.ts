/**
 * Renders `assets/mac-icon.icon/Assets/mesh-gradient.png`, the color layer that
 * sits under the app icon's translucent glass body.
 *
 * The mesh is the sidebar mark's own color field — the same silhouette, the
 * same blobs, the same side fade, rim mask and colored rim — painted onto white
 * and flattened to a PNG, because Icon Composer takes images, not SVG. Keeping
 * it generated from `haus-ghost-palette.ts` and `haus-ghost-paths.ts` is
 * what stops the icon and the mark from drifting apart.
 *
 *   bun run icon:render-mesh        (from apps/website)
 *   bun run icons:render-mesh       (from the repository root)
 *
 * Then recompile the `.icon` with `node scripts/build-macos-app-icon.mjs` and
 * refresh the iOS catalog with `bun run ios:prepare-icon`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { GLASS, RIM_MASK_FLOOR, SIDE_FADE } from '../src/components/haus-ghost-palette.ts';
import { BODY_PATH } from '../src/components/haus-ghost-paths.ts';
import {
    figureDefs,
    figureOverlays,
    type MeshFigure,
    type MeshFootprint,
} from './render-icon-mesh-figure.ts';

export interface MeshBlob {
    color: string;
    cx: number;
    cy: number;
    id: string;
    opacity: number;
    r: number;
}

export interface RimStop {
    color: string;
    offset: number;
}

export interface EdgeVeil {
    /** Where the veil runs from clear to full, in the mark's user space. */
    axis: { x1: number; x2: number; y1: number; y2: number };
    /** Gaussian blur on the veil stroke, in the mark's user space. */
    blur: number;
    /** Overall strength of the veiled edge. */
    opacity: number;
    /** Stroke weight; the body clip keeps the inner half. */
    width: number;
}

export interface IconProfile {
    /** Per-blob edits to the shared table, keyed by blob id. */
    readonly blobOverrides: Readonly<Record<string, Partial<MeshBlob>>>;
    /** A blob the icon paints inside the body but outside both masks, so it
        lands in the middle instead of being pushed to the contour. */
    readonly core: MeshBlob | null;
    /** The thickness cue: white pooled along the lit-away edge. */
    readonly edgeVeil: EdgeVeil | null;
    /** A different figure than the ghost, with its own silhouette, color field
        and layer footprint. Unset paints the ghost. */
    readonly figure?: MeshFigure;
    /** The colored rim's opacity. The sidebar mark paints it at 0.55. */
    readonly rimOpacity: number;
    /** Where each color lands along the rim run. */
    readonly rimStops: readonly RimStop[];
}

/**
 * Icon-only overrides; the sidebar mark never reads this.
 *
 * Two things separate the icon from the mark. The icon's mesh is read through a
 * translucent white glass body at 0.1, which eats roughly a third of every
 * value, so the rim is painted stronger than the mark's 0.55 to survive it. And
 * the icon is one tile from 32px to 1024px rather than a 22px sidebar row, so
 * it can carry an interior the mark could not: `core` is the azure that makes
 * the body glow from behind the eyes instead of reading as a white dome with
 * colored trim, and it is painted outside the rim mask precisely because the
 * mark's whole geometry is built to push color away from the middle.
 *
 * The rim is the other half of that balance. At the mark's stop table rose owns
 * the run from 0.58 out, which on a tile reads as a hot band under the lobes;
 * starting it later and letting `roseLight` take the last stretch keeps the
 * lower-right contour warm without the bottom edge shouting.
 *
 * `edgeVeil` is the depth cue the first glass pass lost. The original raster
 * icon read as thick glass because its white was near-clear through the middle
 * and pooled opaque along the right and bottom-right silhouette; a mesh that is
 * uniformly colored under a uniform glass body reads flat instead. The veil is
 * white pooled back onto that same run — painted over the mesh and the rim,
 * clipped to the body, and masked to nothing toward the upper left, where the
 * light is supposed to be coming from.
 */
export const ICON_PROFILE: IconProfile = {
    blobOverrides: {
        azure: { opacity: 0.86 },
    },
    core: { id: 'core', color: GLASS.meshAzure, cx: 110, cy: 100, r: 56, opacity: 0.3 },
    edgeVeil: {
        width: 31,
        blur: 13,
        opacity: 0.58,
        axis: { x1: 40, y1: 40, x2: 170, y2: 190 },
    },
    rimOpacity: 0.62,
    rimStops: [
        { offset: 0, color: GLASS.azure },
        { offset: 0.34, color: GLASS.violet },
        { offset: 0.66, color: GLASS.rose },
        { offset: 0.82, color: GLASS.rose },
        { offset: 1, color: GLASS.roseLight },
    ],
};

export async function renderIconMesh({
    outPath = DEFAULT_OUT_PATH,
    profile = ICON_PROFILE,
}: {
    outPath?: string;
    profile?: IconProfile;
} = {}): Promise<string> {
    const { canvas, content } = profile.figure?.footprint ?? GHOST_FOOTPRINT;
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({
            viewport: { width: canvas.width, height: canvas.height },
        });
        await page.setContent(
            `<style>html,body{margin:0;padding:0;background:transparent}</style>${meshSvg(profile)}`
        );
        await page.evaluate(fitBodyToFootprint, content);
        const png = await page.locator('#mesh-canvas').screenshot({ omitBackground: true });
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, png);
        return outPath;
    } finally {
        await browser.close();
    }
}

/* The mesh in the mark's own 192x204 user space. A single wrapping transform
   puts it on the icon canvas, so every blur radius, mask run and stroke width
   below is the number the component uses. */
function meshSvg(profile: IconProfile): string {
    const blobs = iconBlobs(profile);
    const { figure } = profile;
    const body = figure?.body ?? BODY_PATH;
    const { canvas } = figure?.footprint ?? GHOST_FOOTPRINT;

    return `<svg id="mesh-canvas" xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <defs>
    <clipPath id="body"><path d="${body}"/></clipPath>
    <filter id="mesh-blur" filterUnits="userSpaceOnUse" x="${-FILTER_MARGIN}" y="${-FILTER_MARGIN}" width="${FILTER_SPAN}" height="${FILTER_SPAN}"><feGaussianBlur stdDeviation="${MESH_BLUR}"/></filter>
    <filter id="rim-blur" filterUnits="userSpaceOnUse" x="${-FILTER_MARGIN}" y="${-FILTER_MARGIN}" width="${FILTER_SPAN}" height="${FILTER_SPAN}"><feGaussianBlur stdDeviation="${RIM_BLUR}"/></filter>
    <linearGradient id="rim-color" gradientUnits="userSpaceOnUse" x1="158" y1="16" x2="86" y2="200">
      ${profile.rimStops.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join('')}
    </linearGradient>
    <linearGradient id="side-fade" gradientUnits="userSpaceOnUse" x1="18" y1="14" x2="150" y2="172">
      ${SIDE_FADE.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.gray}"/>`).join('')}
    </linearGradient>
    <mask id="side-mask" maskUnits="userSpaceOnUse" x="${-MASK_MARGIN}" y="${-MASK_MARGIN}" width="${MASK_SPAN}" height="${MASK_SPAN}">
      <rect x="${-MASK_MARGIN}" y="${-MASK_MARGIN}" width="${MASK_SPAN}" height="${MASK_SPAN}" fill="url(#side-fade)"/>
    </mask>
    <mask id="rim-mask" maskUnits="userSpaceOnUse" x="${-MASK_MARGIN}" y="${-MASK_MARGIN}" width="${MASK_SPAN}" height="${MASK_SPAN}">
      <rect x="${-MASK_MARGIN}" y="${-MASK_MARGIN}" width="${MASK_SPAN}" height="${MASK_SPAN}" fill="${RIM_MASK_FLOOR}"/>
      <path d="${body}" fill="none" stroke="${GLASS.highlight}" stroke-width="${RIM_MASK_WIDTH}" filter="url(#rim-blur)"/>
    </mask>
    ${profile.edgeVeil ? veilDefs(profile.edgeVeil) : ''}${figure ? figureDefs(figure, FILTER_REGION) : ''}
  </defs>
  <g id="mesh">
    <path id="body-metric" d="${body}" fill="none" stroke="none"/>
    <g clip-path="url(#body)">
      <rect x="${-MASK_MARGIN}" y="${-MASK_MARGIN}" width="${MASK_SPAN}" height="${MASK_SPAN}" fill="${figure ? 'url(#figure-base)' : GLASS.highlight}"/>
      ${profile.core ? blobField([profile.core]) : ''}${figure ? blobField(figure.patches) : ''}
      <g mask="url(#side-mask)">
        <g mask="url(#rim-mask)">
          ${blobField(blobs)}
        </g>
        <path d="${body}" fill="none" stroke="url(#rim-color)" stroke-width="${RIM_STROKE_WIDTH}" opacity="${profile.rimOpacity}" filter="url(#rim-blur)"/>
      </g>
      ${profile.edgeVeil ? veilStroke(profile.edgeVeil, body) : ''}${figure ? figureOverlays(figure) : ''}
    </g>
  </g>
</svg>`;
}

/* The veil's own blur and its fade to nothing. The mask ramp holds near-black
   through the first half of the run so the veil never creeps into the middle:
   what sells thickness is white pooled at one edge, not white everywhere. */
function veilDefs(veil: EdgeVeil): string {
    return `<filter id="veil-blur" filterUnits="userSpaceOnUse" x="${-FILTER_MARGIN}" y="${-FILTER_MARGIN}" width="${FILTER_SPAN}" height="${FILTER_SPAN}"><feGaussianBlur stdDeviation="${veil.blur}"/></filter>
    <linearGradient id="veil-fade" gradientUnits="userSpaceOnUse" x1="${veil.axis.x1}" y1="${veil.axis.y1}" x2="${veil.axis.x2}" y2="${veil.axis.y2}">
      ${VEIL_FADE.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.gray}"/>`).join('')}
    </linearGradient>
    <mask id="veil-mask" maskUnits="userSpaceOnUse" x="${-MASK_MARGIN}" y="${-MASK_MARGIN}" width="${MASK_SPAN}" height="${MASK_SPAN}">
      <rect x="${-MASK_MARGIN}" y="${-MASK_MARGIN}" width="${MASK_SPAN}" height="${MASK_SPAN}" fill="url(#veil-fade)"/>
    </mask>`;
}

/* A stroke on the silhouette, so the body clip keeps only its inner half: the
   white thickens inward from the contour instead of haloing outside it. */
function veilStroke(veil: EdgeVeil, body: string): string {
    return `<g mask="url(#veil-mask)"><path d="${body}" fill="none" stroke="${GLASS.highlight}" stroke-width="${veil.width}" opacity="${veil.opacity}" filter="url(#veil-blur)"/></g>`;
}

/* Two blurred passes of the same slightly grown blobs. A single pass of a blob
   this soft reads as a tint on white; the icon needs color the glass body can
   still be seen through, and stacking the blurred field on itself deepens it
   without hardening any edge. */
function blobField(blobs: readonly MeshBlob[]): string {
    const circles = blobs
        .map(
            (blob) =>
                `<circle cx="${blob.cx}" cy="${blob.cy}" r="${blob.r + BLOB_GROW}" fill="${blob.color}" fill-opacity="${blob.opacity}"/>`
        )
        .join('');
    const pass = `<g filter="url(#mesh-blur)">${circles}</g>`;

    return pass + pass;
}

function iconBlobs(profile: IconProfile): readonly MeshBlob[] {
    return (profile.figure?.blobs ?? MESH_BLOBS).map((blob) => ({
        ...blob,
        ...profile.blobOverrides[blob.id],
    }));
}

/* Runs in the page: measures the silhouette and lays it on the exact rectangle
   the committed PNG already occupies, so a re-render is a drop-in replacement
   for the layer Icon Composer positions. The half-pixel inset is the
   antialiased edge, which is what the stored alpha bounds actually measure. */
function fitBodyToFootprint(content: { bottom: number; left: number; right: number; top: number }) {
    const mesh = document.getElementById('mesh') as unknown as SVGGraphicsElement;
    const body = (
        document.getElementById('body-metric') as unknown as SVGGraphicsElement
    ).getBBox();
    const scaleX = (content.right - content.left - 1) / body.width;
    const scaleY = (content.bottom - content.top - 1) / body.height;
    mesh.setAttribute(
        'transform',
        `translate(${content.left + 0.5 - body.x * scaleX} ${content.top + 0.5 - body.y * scaleY}) scale(${scaleX} ${scaleY})`
    );
}

/** The three blobs `haus-ghost-glass.tsx` paints. They are not exported from
    the component, so this table mirrors it; keep the two in step. */
const MESH_BLOBS: readonly MeshBlob[] = [
    { id: 'azure', color: GLASS.meshAzure, cx: 154, cy: 68, r: 50, opacity: 0.78 },
    { id: 'violet', color: GLASS.meshViolet, cx: 110, cy: 142, r: 39, opacity: 0.66 },
    { id: 'rose', color: GLASS.meshRose, cx: 163, cy: 187, r: 42, opacity: 0.74 },
];

/** Clear through the upper-left half of the veil's run, then up to full along
    the right and bottom-right contour. */
const VEIL_FADE: readonly { gray: string; offset: number }[] = [
    { offset: 0, gray: '#000' },
    { offset: 0.45, gray: '#1a1a1a' },
    { offset: 0.78, gray: '#a8a8a8' },
    { offset: 1, gray: '#fff' },
];

/** The committed layer's footprint: Icon Composer positions this exact canvas,
    with the silhouette on this exact rectangle. */
const GHOST_FOOTPRINT: MeshFootprint = {
    canvas: { height: 2464, width: 1805 },
    content: { bottom: 2031, left: 113, right: 1640, top: 410 },
};

/* Every number below is the component's, in its own user space:
   `haus-ghost-glass-defs.tsx` for the blurs, margins and mask width,
   `haus-ghost.css` for the rim's stroke weight. */
const MESH_BLUR = 22;
const RIM_BLUR = 10;
const RIM_MASK_WIDTH = 40;
const RIM_STROKE_WIDTH = 29;
const FILTER_MARGIN = 120;
const FILTER_SPAN = 204 + 2 * FILTER_MARGIN;
const FILTER_REGION = `filterUnits="userSpaceOnUse" x="${-FILTER_MARGIN}" y="${-FILTER_MARGIN}" width="${FILTER_SPAN}" height="${FILTER_SPAN}"`;
const MASK_MARGIN = 60;
const MASK_SPAN = 204 + 2 * MASK_MARGIN;
const BLOB_GROW = 2;

const DEFAULT_OUT_PATH = fileURLToPath(
    new URL('../../../assets/mac-icon.icon/Assets/mesh-gradient.png', import.meta.url)
);

if (import.meta.main) {
    const written = await renderIconMesh();
    console.log(`[haus] icon mesh rendered to ${written}`);
}

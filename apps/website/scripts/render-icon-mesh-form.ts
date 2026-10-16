/**
 * The icon mesh's copy of the mark's form shading (`haus-ghost-form.tsx`):
 * the same `FormPaint` list, emitted as SVG strings so the icon and the
 * in-app mark shade the pumpkin identically.
 */

import { FORM_BODY, type FormPaint } from '../src/components/haus-ghost-figure.ts';

export function formDefs(form: readonly FormPaint[]): string {
    return form.map(paintDefs).join('');
}

/** `body` replaces `FORM_BODY`, so a paint can trace the icon's own silhouette. */
export function formPaints(form: readonly FormPaint[], body: string): string {
    return form
        .map((paint) => {
            const color =
                typeof paint.paint === 'string' ? paint.paint : `url(#${id(paint)}-paint)`;
            const d = paint.d === FORM_BODY ? body : paint.d;
            const filter = paint.blur > 0 ? ` filter="url(#${id(paint)}-blur)"` : '';
            const shape =
                paint.mode === 'fill'
                    ? `fill="${color}"`
                    : `fill="none" stroke="${color}" stroke-width="${paint.width}" stroke-linecap="round"`;
            return `<path d="${d}" ${shape} opacity="${paint.opacity}"${filter}/>`;
        })
        .join('');
}

function paintDefs(paint: FormPaint): string {
    const gradient = typeof paint.paint === 'string' ? null : paint.paint;
    const stops = gradient?.stops
        .map(
            (stop) =>
                `<stop offset="${stop.offset}" stop-color="${stop.color}" stop-opacity="${stop.opacity}"/>`
        )
        .join('');
    const paintDef =
        gradient?.kind === 'linear'
            ? `<linearGradient id="${id(paint)}-paint" gradientUnits="userSpaceOnUse" x1="${gradient.x1}" y1="${gradient.y1}" x2="${gradient.x2}" y2="${gradient.y2}">${stops}</linearGradient>`
            : gradient?.kind === 'radial'
              ? `<radialGradient id="${id(paint)}-paint" gradientUnits="userSpaceOnUse" cx="${gradient.cx}" cy="${gradient.cy}" r="${gradient.r}">${stops}</radialGradient>`
              : '';
    const blurDef =
        paint.blur > 0
            ? `<filter id="${id(paint)}-blur" filterUnits="userSpaceOnUse" x="-60" y="-60" width="324" height="324"><feGaussianBlur stdDeviation="${paint.blur}"/></filter>`
            : '';
    return paintDef + blurDef;
}

function id(paint: FormPaint) {
    return `form-${paint.id}`;
}

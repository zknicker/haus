/**
 * The layers a solid figure adds to the glass stack: drifting color patches
 * on its interior, and form shading over its color. Both render nothing for
 * a figure without them, so the ghost's markup is untouched.
 */

import { FORM_BODY, type FormPaint, type GlassFigure } from './haus-ghost-figure.ts';
import type { GhostGlassIds } from './haus-ghost-glass-defs.tsx';

/** Interior color patches, blurred into one field and riding the ghost's own
    drift loops. Painted under the ribs and the stem glaze. */
export function GlassPatches({ figure, ids }: { figure: GlassFigure; ids: GhostGlassIds }) {
    if (!figure.patches) {
        return null;
    }
    return (
        <g className="haus-ghost__patches" filter={`url(#${ids.meshBlur})`}>
            {figure.patches.map((patch) => (
                <circle
                    className={`haus-ghost__blob haus-ghost__blob--${patch.drift}`}
                    cx={patch.cx}
                    cy={patch.cy}
                    fill={patch.color}
                    fillOpacity={patch.opacity}
                    key={patch.id}
                    r={patch.r}
                />
            ))}
        </g>
    );
}

/** Form shading: core shadow, lobe crowns, recesses, bounce light and the
    stem's cylinder. Painted over the color and under the white light. */
export function GlassForm({ figure, ids }: { figure: GlassFigure; ids: GhostGlassIds }) {
    if (!figure.form) {
        return null;
    }
    const scope = (paint: FormPaint) => `${ids.clip}-form-${paint.id}`;

    return (
        <g className="haus-ghost__form">
            <defs>
                {figure.form.map((paint) => (
                    <FormDefs id={scope(paint)} key={paint.id} paint={paint} />
                ))}
            </defs>
            {figure.form.map((paint) => {
                const id = scope(paint);
                const color = typeof paint.paint === 'string' ? paint.paint : `url(#${id}-paint)`;
                return (
                    <path
                        d={paint.d === FORM_BODY ? figure.body : paint.d}
                        fill={paint.mode === 'fill' ? color : 'none'}
                        filter={paint.blur > 0 ? `url(#${id}-blur)` : undefined}
                        key={paint.id}
                        opacity={paint.opacity}
                        stroke={paint.mode === 'stroke' ? color : undefined}
                        strokeLinecap="round"
                        strokeWidth={paint.width}
                    />
                );
            })}
        </g>
    );
}

function FormDefs({ id, paint }: { id: string; paint: FormPaint }) {
    const gradient = typeof paint.paint === 'string' ? null : paint.paint;
    const stops = gradient?.stops.map((stop) => (
        <stop
            key={stop.offset}
            offset={stop.offset}
            stopColor={stop.color}
            stopOpacity={stop.opacity}
        />
    ));

    return (
        <>
            {gradient?.kind === 'linear' ? (
                <linearGradient
                    gradientUnits="userSpaceOnUse"
                    id={`${id}-paint`}
                    x1={gradient.x1}
                    x2={gradient.x2}
                    y1={gradient.y1}
                    y2={gradient.y2}
                >
                    {stops}
                </linearGradient>
            ) : null}
            {gradient?.kind === 'radial' ? (
                <radialGradient
                    cx={gradient.cx}
                    cy={gradient.cy}
                    gradientUnits="userSpaceOnUse"
                    id={`${id}-paint`}
                    r={gradient.r}
                >
                    {stops}
                </radialGradient>
            ) : null}
            {paint.blur > 0 ? (
                <filter
                    filterUnits="userSpaceOnUse"
                    height={FORM_SPAN}
                    id={`${id}-blur`}
                    width={FORM_SPAN}
                    x={-FORM_MARGIN}
                    y={-FORM_MARGIN}
                >
                    <feGaussianBlur stdDeviation={paint.blur} />
                </filter>
            ) : null}
        </>
    );
}

const FORM_MARGIN = 60;
const FORM_SPAN = 204 + 2 * FORM_MARGIN;

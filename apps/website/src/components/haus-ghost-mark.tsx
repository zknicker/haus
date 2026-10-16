import { type ComponentPropsWithoutRef, useId } from 'react';
import { cn } from '../lib/utils.ts';
import type { GlassFigure } from './haus-ghost-figure.ts';
import { HausGhostGlass } from './haus-ghost-glass.tsx';
import { ghostGlassIds } from './haus-ghost-glass-defs.tsx';
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from './haus-ghost-paths.ts';
import './haus-ghost.css';

export type HausMarkProps = {
    /**
     * `solid` paints the body in `currentColor` with the eyes punched out as
     * holes, so whatever sits behind the mark shows through them.
     * `iridescent` renders it as translucent glass: a hollow interior the
     * ground reads through, a mesh-colored rim, and a white dome highlight.
     */
    fill?: MarkFill;
    /** Iridescent only: drift the mesh so the color slowly reorganizes. */
    animated?: boolean;
    /** Animated only: `lively` runs the same drift loops 2.5x faster. */
    tempo?: MarkTempo;
    /** Rendered height in px; width follows the 192:204 aspect. */
    size?: number;
    className?: string;
} & Omit<ComponentPropsWithoutRef<'svg'>, 'fill'>;

/**
 * The Haus mark's one SVG frame, shared by every figure it wears. The figure
 * decides the shape and colors; this owns the box, the fill modes, the drift
 * classes, and the accessible name, so a costume can never change any of them.
 */
export function HausFigureMark({
    figure,
    fill = 'solid',
    animated = false,
    tempo = 'calm',
    size = 24,
    className,
    style,
    ...props
}: HausMarkProps & { figure: GlassFigure }) {
    const instanceId = useId().replaceAll(':', '');
    const iridescent = fill === 'iridescent';
    const drifting = iridescent && animated;
    // A `<title>` is the browser's native tooltip too, and `aria-hidden` does
    // not suppress it — a decorative mark would pop "Haus" on every hover.
    const decorative = props['aria-hidden'] === true || props['aria-hidden'] === 'true';

    return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: the title is conditional, because a decorative instance names itself with `aria-hidden` instead
        <svg
            className={cn(
                'haus-ghost',
                iridescent && 'haus-ghost--iridescent',
                drifting && 'haus-ghost--animated',
                drifting && tempo === 'lively' && 'haus-ghost--lively',
                className
            )}
            role={decorative ? undefined : 'img'}
            // Inline, so chrome rules that force a glyph box — the sidebar
            // pins `.sidebar__menu-icon svg` to 1rem — cannot resize the mark.
            style={{ height: size, width: (size * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT, ...style }}
            viewBox={`${figure.frame?.x ?? 0} ${figure.frame?.y ?? 0} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            {decorative ? null : <title>Haus</title>}
            {iridescent ? (
                <HausGhostGlass figure={figure} ids={ghostGlassIds(instanceId)} />
            ) : (
                <path
                    className="haus-ghost__body"
                    d={`${figure.body} ${figure.eyes}`}
                    fill="currentColor"
                    fillRule="evenodd"
                />
            )}
        </svg>
    );
}

type MarkFill = 'solid' | 'iridescent';
type MarkTempo = 'calm' | 'lively';

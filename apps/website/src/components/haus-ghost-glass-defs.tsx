/**
 * Every def the glass stack paints with: the blur radii, the gradients, and
 * the masks that decide how much of each layer lands where. The colors and the
 * stop tables they read live in the figure (`haus-ghost-figure.ts`) and the
 * shared fades in `haus-ghost-palette.ts`.
 *
 * The two fade masks are the shape of the whole idea. `sideMask` leans the
 * color right and down; `domeMask` leans the white highlight up and left.
 */

import type { GlassFigure } from './haus-ghost-figure.ts';
import {
    DOME_FADE,
    type FadeStop,
    RIM_MASK_FLOOR,
    SCATTER_PROFILE,
    SIDE_FADE,
} from './haus-ghost-palette.ts';
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from './haus-ghost-paths.ts';

export interface GhostGlassIds {
    clip: string;
    coreBlur: string;
    domeMask: string;
    edge: string;
    haloBlur: string;
    interior: string;
    lightBlur: string;
    meshBlur: string;
    rimBlur: string;
    rimColor: string;
    rimMask: string;
    sideMask: string;
    tint: string;
    tintClip: string;
}

/** One `useId`-unique name per def, so two marks on a page never collide. */
export function ghostGlassIds(instanceId: string): GhostGlassIds {
    const name = (part: string) => `haus-ghost-${part}-${instanceId}`;

    return {
        clip: name('clip'),
        coreBlur: name('core-blur'),
        domeMask: name('dome'),
        edge: name('edge'),
        haloBlur: name('halo-blur'),
        interior: name('interior'),
        lightBlur: name('light-blur'),
        meshBlur: name('mesh-blur'),
        rimBlur: name('rim-blur'),
        rimColor: name('rim-color'),
        rimMask: name('rim-mask'),
        sideMask: name('side-mask'),
        tint: name('tint'),
        tintClip: name('tint-clip'),
    };
}

export function GlassDefs({ figure, ids }: { figure: GlassFigure; ids: GhostGlassIds }) {
    return (
        <defs>
            <clipPath id={ids.clip}>
                <path d={figure.body} />
            </clipPath>
            {figure.tint ? (
                <>
                    <clipPath id={ids.tintClip}>
                        <path d={figure.tint.path} />
                    </clipPath>
                    <linearGradient
                        gradientUnits="userSpaceOnUse"
                        id={ids.tint}
                        x1="0"
                        x2="0"
                        y1={figure.tint.y1}
                        y2={figure.tint.y2}
                    >
                        {figure.tint.stops.map((stop) => (
                            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                        ))}
                    </linearGradient>
                </>
            ) : null}
            {BLURS.map((blur) => (
                <filter
                    filterUnits="userSpaceOnUse"
                    height={VIEWBOX_HEIGHT + 2 * FILTER_MARGIN}
                    id={ids[blur.id]}
                    key={blur.id}
                    width={VIEWBOX_WIDTH + 2 * FILTER_MARGIN}
                    x={-FILTER_MARGIN}
                    y={-FILTER_MARGIN}
                >
                    <feGaussianBlur stdDeviation={blur.deviation} />
                </filter>
            ))}
            <radialGradient
                cx={figure.scatter.cx}
                cy={figure.scatter.cy}
                gradientUnits="userSpaceOnUse"
                id={ids.interior}
                r={figure.scatter.r}
            >
                {SCATTER_PROFILE.map((stop, index) => (
                    <stop
                        key={stop.offset}
                        offset={stop.offset}
                        stopColor={figure.scatter.colors[index]}
                        // `var()` substitutes in a declaration, never in an attribute.
                        style={{ stopOpacity: `var(${stop.falloff})` }}
                    />
                ))}
            </radialGradient>
            <linearGradient
                gradientUnits="userSpaceOnUse"
                id={ids.rimColor}
                x1="158"
                x2="86"
                y1="16"
                y2="200"
            >
                {figure.rimStops.map((stop) => (
                    <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                ))}
            </linearGradient>
            <linearGradient
                gradientUnits="userSpaceOnUse"
                id={ids.edge}
                x1="26"
                x2="164"
                y1="16"
                y2="192"
            >
                {figure.edgeStops.map((stop) => (
                    <stop
                        key={stop.offset}
                        offset={stop.offset}
                        stopColor={stop.color}
                        stopOpacity={stop.opacity}
                    />
                ))}
            </linearGradient>
            {/* Color leans right and down. A mask, not a per-layer opacity, so
                the mesh and the colored rim fade together and the upper-left
                quadrant stays clear enough for the white highlight to own it. */}
            <FadeMask id={ids.sideMask} stops={SIDE_FADE} x1={18} x2={150} y1={14} y2={172} />
            {/* The white highlight is the mirror of it: the dome only. */}
            <FadeMask id={ids.domeMask} stops={DOME_FADE} x1={14} x2={150} y1={40} y2={110} />
            {/* Hollow in the middle, luminous at the silhouette — the one
                gradient that makes a translucent shape read as thick glass. */}
            <mask
                height={MASK_SPAN}
                id={ids.rimMask}
                maskUnits="userSpaceOnUse"
                width={MASK_SPAN}
                x={-MASK_MARGIN}
                y={-MASK_MARGIN}
            >
                <rect
                    fill={RIM_MASK_FLOOR}
                    height={MASK_SPAN}
                    width={MASK_SPAN}
                    x={-MASK_MARGIN}
                    y={-MASK_MARGIN}
                />
                <path
                    d={figure.body}
                    fill="none"
                    filter={`url(#${ids.rimBlur})`}
                    stroke="#fff"
                    strokeWidth={RIM_MASK_WIDTH}
                />
            </mask>
        </defs>
    );
}

function FadeMask({ id, stops, x1, x2, y1, y2 }: FadeMaskProps) {
    const gradientId = `${id}-fade`;

    return (
        <>
            <linearGradient
                gradientUnits="userSpaceOnUse"
                id={gradientId}
                x1={x1}
                x2={x2}
                y1={y1}
                y2={y2}
            >
                {stops.map((stop) => (
                    <stop key={stop.offset} offset={stop.offset} stopColor={stop.gray} />
                ))}
            </linearGradient>
            <mask
                height={MASK_SPAN}
                id={id}
                maskUnits="userSpaceOnUse"
                width={MASK_SPAN}
                x={-MASK_MARGIN}
                y={-MASK_MARGIN}
            >
                <rect
                    fill={`url(#${gradientId})`}
                    height={MASK_SPAN}
                    width={MASK_SPAN}
                    x={-MASK_MARGIN}
                    y={-MASK_MARGIN}
                />
            </mask>
        </>
    );
}

interface FadeMaskProps {
    id: string;
    stops: readonly FadeStop[];
    x1: number;
    x2: number;
    y1: number;
    y2: number;
}

/** Room for the widest blob plus its blur plus its drift. */
const FILTER_MARGIN = 120;
const MASK_MARGIN = 60;
const MASK_SPAN = VIEWBOX_HEIGHT + 2 * MASK_MARGIN;

const BLURS = [
    /** About half a blob, which fuses the three into one field. Below roughly
        20 the blobs get visible edges at 160px and read as three tinted balls. */
    { id: 'meshBlur', deviation: 22 },
    /** The colored rim is a bloom, so it stays the softest of the three. */
    { id: 'rimBlur', deviation: 10 },
    { id: 'lightBlur', deviation: 5 },
    /** Barely softened: the hot line has to stay a line. */
    { id: 'coreBlur', deviation: 2 },
    /** Tight enough that the halo never reads as haze in a 22px row. */
    { id: 'haloBlur', deviation: 2.5 },
] as const satisfies readonly { deviation: number; id: keyof GhostGlassIds }[];

/** Straddles the path; the body clip throws away the outer half. */
const RIM_MASK_WIDTH = 40;

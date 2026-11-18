/*
 * Motion contract: the folder animates from an ancestor, so a whole tile
 * (icon and label) is the target. Give that ancestor `artifact-folder-trigger`.
 * Hover (`:hover`, `[data-hovered]`), keyboard focus (`[data-focus-visible]`,
 * `:focus-visible`) or `[data-open]` (the selected folder) tips the front
 * panel open and fans the peeking files up; press (`[data-pressed]`,
 * `:active`) settles the whole icon down a step. Transitions only, so every
 * state is interruptible; reduced motion keeps the icon still. Rules live in
 * `default-theme.css` (Artifact icons).
 */
import { type CSSProperties, useId } from 'react';
import { cn } from '../../../lib/utils.ts';
import { ArtifactFileIcon, insideHairline } from './artifact-file-icon.tsx';
import type { ArtifactFileKind } from './artifact-file-kind.ts';

export const artifactFolderTones = ['neutral', 'blue', 'violet', 'green', 'amber', 'rose'] as const;
export type ArtifactFolderTone = (typeof artifactFolderTones)[number];

/** Something peeking out of a folder: a photo when an image URL is known, else a mini sheet. */
export interface ArtifactFolderPreview {
    imageUrl?: string;
    kind: ArtifactFileKind;
}

// Below this the peeking items read as noise; rows get a flat 16-unit folder.
const smallBelow = 20;

/**
 * A library folder: a tinted back panel with a tab, a lighter front panel,
 * and up to three of its files peeking out between them. Paints derive from
 * the tone's hue token in `default-theme.css` (Artifact icons). Decorative:
 * the folder's name is always rendered beside it.
 */
export function ArtifactFolderIcon({
    className,
    previews = [],
    size = 64,
    tone,
}: {
    className?: string;
    previews?: readonly ArtifactFolderPreview[];
    size?: number;
    tone: ArtifactFolderTone;
}) {
    const id = useId();
    const style = { '--artifact-folder-hue': `var(--artifact-folder-${tone})` } as CSSProperties;
    const svgProps = {
        className: cn('artifact-folder-icon shrink-0', className),
        fill: 'none',
        height: size,
        style,
        width: size,
    } as const;
    const frontClip = `${id}-front`;

    if (size < smallBelow) {
        return (
            <svg {...svgProps} aria-hidden="true" viewBox="0 0 16 16">
                <defs>
                    <clipPath id={frontClip}>
                        <path d={small.front} />
                    </clipPath>
                </defs>
                <path d={small.back} fill="var(--artifact-folder-back)" />
                <path d={small.front} fill="var(--artifact-folder-front-bottom)" />
                <path
                    clipPath={`url(#${frontClip})`}
                    d={small.lip}
                    fill="var(--artifact-folder-highlight)"
                    fillRule="evenodd"
                />
            </svg>
        );
    }

    const frontFill = `${id}-fill`;
    const shadeFill = `${id}-shade`;
    const items = previews.slice(0, previewSlots.length);
    const slots = previewSlots[items.length - 1] ?? [];
    const edge = insideHairline(64, size);
    return (
        <svg {...svgProps} aria-hidden="true" viewBox="0 0 64 64">
            <defs>
                <linearGradient
                    gradientUnits="userSpaceOnUse"
                    id={frontFill}
                    x1="0"
                    x2="0"
                    y1={large.frontTop}
                    y2={large.bottom}
                >
                    <stop offset="0" stopColor="var(--artifact-folder-front-top)" />
                    <stop offset="1" stopColor="var(--artifact-folder-front-bottom)" />
                </linearGradient>
                <linearGradient
                    gradientUnits="userSpaceOnUse"
                    id={shadeFill}
                    x1="0"
                    x2="0"
                    y1={large.frontTop - large.shade}
                    y2={large.frontTop}
                >
                    <stop offset="0" stopColor="var(--artifact-folder-shadow)" stopOpacity="0" />
                    <stop offset="1" stopColor="var(--artifact-folder-shadow)" />
                </linearGradient>
                <clipPath id={frontClip}>
                    <path d={large.front} />
                </clipPath>
            </defs>
            <path d={large.back} fill="var(--artifact-folder-back)" />
            {items.map((item, index) => {
                const slot = slots[index];
                return slot ? (
                    <FolderPreviewItem
                        clipId={`${id}-p${index}`}
                        item={item}
                        key={`${slot.x}-${slot.y}`}
                        slot={slot}
                    />
                ) : null;
            })}
            <g className="artifact-folder-icon__front">
                {/* The lip's shadow is the panel itself raised, so it spans the full width and follows the corners. */}
                <path d={large.shadow} fill={`url(#${shadeFill})`} />
                <path d={large.front} fill={`url(#${frontFill})`} />
                <path
                    clipPath={`url(#${frontClip})`}
                    d={large.lip}
                    fill="var(--artifact-folder-highlight)"
                    fillRule="evenodd"
                />
                <path
                    clipPath={`url(#${frontClip})`}
                    d={large.front}
                    stroke="var(--artifact-folder-edge)"
                    style={edge}
                />
            </g>
        </svg>
    );
}

interface PreviewSlot {
    /** How far the item spreads sideways and turns when the folder opens. */
    fan: { rotate: number; x: number };
    rotate: number;
    x: number;
    y: number;
}

// Top-center anchors in the 64 grid. Later items overlap earlier ones, so the
// fan reads left to right; tops sit above the front panel's edge at y 26.
const previewSlots: readonly (readonly PreviewSlot[])[] = [
    [{ x: 32, y: 9, rotate: -4, fan: { x: 0, rotate: -2 } }],
    [
        { x: 26, y: 10.5, rotate: -9, fan: { x: -1.5, rotate: -3 } },
        { x: 38.5, y: 9, rotate: 6, fan: { x: 1.5, rotate: 3 } },
    ],
    [
        { x: 21, y: 12, rotate: -11, fan: { x: -1, rotate: -3 } },
        { x: 32, y: 8.5, rotate: -1.5, fan: { x: 0, rotate: 0 } },
        { x: 43, y: 11.5, rotate: 10, fan: { x: 1, rotate: 3 } },
    ],
];

// Photos run deep into the folder so their bottoms stay hidden as they rise.
const photo = { width: 23, height: 26, inset: 1.6, edge: 0.5 } as const;
const sheetSize = 28;

function FolderPreviewItem({
    clipId,
    item,
    slot,
}: {
    clipId: string;
    item: ArtifactFolderPreview;
    slot: PreviewSlot;
}) {
    const style = {
        '--artifact-folder-fan-x': `${slot.fan.x}px`,
        '--artifact-folder-fan-rotate': `${slot.fan.rotate}deg`,
    } as CSSProperties;
    if (item.imageUrl) {
        const { edge, height, inset, width } = photo;
        return (
            <g className="artifact-folder-icon__preview" style={style}>
                <g
                    transform={`translate(${slot.x - width / 2} ${slot.y}) rotate(${slot.rotate} ${width / 2} ${height})`}
                >
                    <clipPath id={clipId}>
                        <rect
                            height={height - inset * 2}
                            rx="1.3"
                            width={width - inset * 2}
                            x={inset}
                            y={inset}
                        />
                    </clipPath>
                    <rect
                        fill="var(--artifact-folder-paper)"
                        height={height}
                        rx="2.2"
                        width={width}
                    />
                    {/* The frame's edge is inset by half its width so it never straddles the paper's silhouette. */}
                    <rect
                        height={height - edge}
                        rx={2.2 - edge / 2}
                        stroke="var(--artifact-folder-edge)"
                        strokeWidth={edge}
                        width={width - edge}
                        x={edge / 2}
                        y={edge / 2}
                    />
                    <image
                        clipPath={`url(#${clipId})`}
                        height={height - inset * 2}
                        href={item.imageUrl}
                        preserveAspectRatio="xMidYMid slice"
                        width={width - inset * 2}
                        x={inset}
                        y={inset}
                    />
                </g>
            </g>
        );
    }
    return (
        <g className="artifact-folder-icon__preview" style={style}>
            <g
                transform={`translate(${slot.x - sheetSize / 2} ${slot.y - 2.5}) rotate(${slot.rotate} ${sheetSize / 2} ${sheetSize})`}
            >
                <ArtifactFileIcon kind={item.kind} size={sheetSize} />
            </g>
        </g>
    );
}

/** A rounded rectangle as a path, so panels can be offset and combined. */
function panel({ height, radius: r, width, x, y }: Panel, dy = 0) {
    const top = y + dy;
    return `M${x} ${top + r}a${r} ${r} 0 0 1 ${r}-${r}h${width - r * 2}a${r} ${r} 0 0 1 ${r} ${r}v${height - r * 2}a${r} ${r} 0 0 1-${r} ${r}h-${width - r * 2}a${r} ${r} 0 0 1-${r}-${r}Z`;
}

interface Panel {
    height: number;
    radius: number;
    width: number;
    x: number;
    y: number;
}

// The front panel. Its lip highlight is the panel minus itself lowered
// (even-odd, clipped to the panel), and its shadow is the panel raised, so
// both follow the corners edge to edge.
const largeFront = { x: 6, y: 26, width: 52, height: 29, radius: 4 } as const;
const lipDepth = 1.2;
const shadeDepth = 3;

const large = {
    back: 'M6 14a4 4 0 0 1 4-4h13.2a4 4 0 0 1 2.95 1.3l2.3 2.5a4 4 0 0 0 2.95 1.3H54a4 4 0 0 1 4 4V51a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4Z',
    front: panel(largeFront),
    lip: panel(largeFront) + panel(largeFront, lipDepth),
    shadow: panel(largeFront, -shadeDepth),
    frontTop: largeFront.y,
    bottom: largeFront.y + largeFront.height,
    shade: shadeDepth,
} as const;

// Whole-pixel edges at 16px: back 14 × 12 with its tab, front 14 × 8.
const smallFront = { x: 1, y: 6, width: 14, height: 8, radius: 1.5 } as const;

const small = {
    back: 'M2.5 2h3.3c.5 0 .9.2 1.2.6l.8 1c.3.4.7.4 1.2.4h4.5a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9A1.5 1.5 0 0 1 2.5 2Z',
    front: panel(smallFront),
    lip: panel(smallFront) + panel(smallFront, 1),
} as const;

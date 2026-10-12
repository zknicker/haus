import { type CSSProperties, useId } from 'react';
import { cn } from '../../../lib/utils.ts';
import { ArtifactFileGlyph } from './artifact-file-glyphs.tsx';
import { ArtifactFileGlyphSmall } from './artifact-file-glyphs-small.tsx';
import type { ArtifactFileKind } from './artifact-file-kind.ts';

// Below this the full illustration blurs; rows and tabs get the 16-unit cut.
const smallBelow = 20;

/**
 * A file as a small rounded sheet with a folded corner, tinted and
 * illustrated by its kind. Paints derive from the kind's hue token in
 * `default-theme.css` (Artifact icons), so it follows the theme. Decorative:
 * the file's name is always rendered beside it.
 *
 * Motion: inside an ancestor with class `artifact-file-trigger`, the sheet
 * lifts a pixel on hover or keyboard focus (see the theme's icon rules).
 */
export function ArtifactFileIcon({
    className,
    kind,
    size = 40,
}: {
    className?: string;
    kind: ArtifactFileKind;
    size?: number;
}) {
    const id = useId();
    const small = size < smallBelow;
    const sheet = small ? smallSheet : largeSheet;
    const fill = `${id}-fill`;
    const sheetClip = `${id}-sheet`;
    const foldClip = `${id}-fold`;
    const edge = insideHairline(sheet.grid, size);
    return (
        <svg
            aria-hidden="true"
            className={cn('artifact-icon shrink-0', className)}
            fill="none"
            height={size}
            style={{ '--artifact-icon-hue': `var(--artifact-kind-${kind})` } as CSSProperties}
            viewBox={`0 0 ${sheet.grid} ${sheet.grid}`}
            width={size}
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="var(--artifact-icon-sheet-top)" />
                    <stop offset="1" stopColor="var(--artifact-icon-sheet-bottom)" />
                </linearGradient>
                <clipPath id={sheetClip}>
                    <path d={sheet.outline} />
                </clipPath>
                <clipPath id={foldClip}>
                    <path d={sheet.fold} />
                </clipPath>
            </defs>
            <path d={sheet.outline} fill={`url(#${fill})`} />
            <path d={sheet.fold} fill="var(--artifact-icon-fold)" />
            <path
                clipPath={`url(#${foldClip})`}
                d={sheet.crease}
                stroke="var(--artifact-icon-crease)"
                style={edge}
            />
            <path
                clipPath={`url(#${sheetClip})`}
                d={sheet.outline}
                stroke="var(--artifact-icon-edge)"
                style={edge}
            />
            {small ? (
                <ArtifactFileGlyphSmall kind={kind} />
            ) : (
                <ArtifactFileGlyph clipId={`${id}-glyph`} kind={kind} />
            )}
        </svg>
    );
}

/**
 * Stroke style for an edge that sits wholly inside the shape it outlines: a
 * doubled stroke the caller clips to that shape, so nothing straddles the
 * silhouette. One CSS pixel at any size, one device pixel on dense screens
 * (`--artifact-hair-scale` in the theme's icon rules).
 */
export function insideHairline(grid: number, size: number): CSSProperties {
    return { strokeWidth: `calc(${(grid / size) * 2} * var(--artifact-hair-scale, 1))` };
}

/**
 * Sheet geometry per grid, on whole units so edges land on device pixels at
 * 16px for the small grid and at 32, 48, 64 and 96px for the large one. The
 * large sheet is 20 × 28 with a 6-unit fold; the small one is 12 × 14 with a
 * 4-unit fold. `crease` is the fold's open inner edge; the diagonal belongs
 * to the sheet outline alone, so it is never stroked twice.
 */
const largeSheet = {
    grid: 32,
    outline: 'M9 2h11l6 6v19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z',
    fold: 'M20 2v4a2 2 0 0 0 2 2h4Z',
    crease: 'M20 2v4a2 2 0 0 0 2 2h4',
} as const;

const smallSheet = {
    grid: 16,
    outline: 'M4 1h6l4 4v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z',
    fold: 'M10 1v3a1 1 0 0 0 1 1h3Z',
    crease: 'M10 1v3a1 1 0 0 0 1 1h3',
} as const;

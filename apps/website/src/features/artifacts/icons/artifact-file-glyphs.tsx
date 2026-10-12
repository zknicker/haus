import type { ArtifactFileKind } from './artifact-file-kind.ts';

/**
 * The illustration inside a file sheet, drawn on the 32-unit sheet grid (see
 * `artifact-file-icon.tsx`): the printable area runs x 9.5–22.5, y 8–26, with
 * the folded corner owning the top right. `clipId` is a per-instance id for
 * glyphs that crop a scene to a frame.
 */
export function ArtifactFileGlyph({ clipId, kind }: { clipId: string; kind: ArtifactFileKind }) {
    switch (kind) {
        case 'document':
            return <DocumentGlyph />;
        case 'text':
            return <TextGlyph />;
        case 'pdf':
            return <PdfGlyph />;
        case 'image':
            return <ImageGlyph clipId={clipId} />;
        case 'video':
            return <VideoGlyph />;
        case 'audio':
            return <AudioGlyph />;
        case 'code':
            return <CodeGlyph />;
        case 'html':
            return <HtmlGlyph />;
        case 'spreadsheet':
            return <SpreadsheetGlyph clipId={clipId} />;
        case 'slides':
            return <SlidesGlyph />;
        case 'archive':
            return <ArchiveGlyph />;
        case 'other':
            return <OtherGlyph />;
    }
}

export const ink = 'var(--artifact-icon-ink)';
export const inkSoft = 'var(--artifact-icon-ink-soft)';
export const onInk = 'var(--artifact-icon-on-ink)';
export const wash = 'var(--artifact-icon-wash)';

const lineProps = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function DocumentGlyph() {
    return (
        <g {...lineProps}>
            <path d="M10 9.5h6" stroke={ink} strokeWidth="2" />
            <path
                d="M10 14h12M10 17.5h12M10 21h12M10 24.5h7.5"
                stroke={inkSoft}
                strokeWidth="1.5"
            />
        </g>
    );
}

function TextGlyph() {
    return (
        <path
            d="M10 9.5h7M10 13h12M10 16.5h10M10 20h12M10 23.5h5.5"
            stroke={ink}
            strokeWidth="1.4"
            {...lineProps}
        />
    );
}

function PdfGlyph() {
    return (
        <>
            <path d="M10 9.5h6M10 13h12" stroke={inkSoft} strokeWidth="1.5" {...lineProps} />
            <rect fill={ink} height="8.5" rx="2" width="14" x="9" y="16.5" />
            <path
                d="M11.1 22.95v-4.4h1.5a1.25 1.25 0 0 1 0 2.5h-1.5M14.7 18.55v4.4h.8a2.2 2.2 0 0 0 0-4.4zM21 18.55h-2.3v4.4M18.7 20.65h1.9"
                stroke={onInk}
                strokeWidth="1.05"
                {...lineProps}
            />
        </>
    );
}

function ImageGlyph({ clipId }: { clipId: string }) {
    return (
        <>
            <clipPath id={clipId}>
                <rect height="13" rx="2.25" width="14" x="9" y="11" />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
                <rect fill={wash} height="13" width="14" x="9" y="11" />
                <circle cx="19" cy="14.75" fill={inkSoft} r="1.75" />
                <path d="M12.5 24.5 17.4 18a.75.75 0 0 1 1.2 0l5 6.5z" fill={inkSoft} />
                <path d="M8 24.5v-1.7l4.4-5.2a.75.75 0 0 1 1.15 0L19.5 24.5z" fill={ink} />
            </g>
        </>
    );
}

function VideoGlyph() {
    return (
        <>
            <rect fill={ink} height="11" rx="2.25" width="14" x="9" y="11" />
            <path
                d="M14.6 14.15v4.7a.6.6 0 0 0 .9.52l3.8-2.35a.6.6 0 0 0 0-1.04l-3.8-2.35a.6.6 0 0 0-.9.52Z"
                fill={onInk}
            />
            <path d="M10 25.25h12" stroke={inkSoft} strokeWidth="1.5" {...lineProps} />
            <path d="M10 25.25h4.5" stroke={ink} strokeWidth="1.5" {...lineProps} />
        </>
    );
}

// Bar half-heights, left to right: a quiet attack, a peak, and a tail.
const waveform = [1.5, 3.5, 5.75, 3.75, 5, 2.5, 1.25] as const;

function AudioGlyph() {
    const d = waveform.map((half, index) => `M${10 + index * 2} ${18 - half}v${half * 2}`).join('');
    return <path d={d} stroke={ink} strokeWidth="1.5" {...lineProps} />;
}

function CodeGlyph() {
    return (
        <path
            d="M13.5 12.5H13a1.5 1.5 0 0 0-1.5 1.5v2.5a1.5 1.5 0 0 1-1.5 1.5 1.5 1.5 0 0 1 1.5 1.5V22a1.5 1.5 0 0 0 1.5 1.5h.5M18.5 12.5h.5a1.5 1.5 0 0 1 1.5 1.5v2.5a1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0-1.5 1.5V22a1.5 1.5 0 0 1-1.5 1.5h-.5"
            stroke={ink}
            strokeWidth="1.6"
            {...lineProps}
        />
    );
}

function HtmlGlyph() {
    return (
        <>
            <path
                d="m13 14-3.5 4 3.5 4M19 14l3.5 4-3.5 4"
                stroke={ink}
                strokeWidth="1.6"
                {...lineProps}
            />
            <path d="m17.2 13-2.4 10" stroke={inkSoft} strokeWidth="1.6" {...lineProps} />
        </>
    );
}

function SpreadsheetGlyph({ clipId }: { clipId: string }) {
    return (
        <>
            <clipPath id={clipId}>
                <rect height="13" rx="2" width="14" x="9" y="11" />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
                <rect fill={wash} height="13" width="14" x="9" y="11" />
                <rect fill={ink} height="3.25" width="14" x="9" y="11" />
                <rect fill={inkSoft} height="9.75" opacity="0.55" width="4.25" x="9" y="14.25" />
                <path
                    d="M13.25 14.25V24M18.1 11v13M9 17.5h14M9 20.75h14"
                    stroke={inkSoft}
                    strokeWidth="0.9"
                />
            </g>
        </>
    );
}

function SlidesGlyph() {
    return (
        <>
            <rect
                fill={wash}
                height="10"
                rx="1.75"
                stroke={ink}
                strokeWidth="1.2"
                width="15"
                x="8.5"
                y="11"
            />
            <path
                d="M12.5 18.5v-2M16 18.5v-4.5M19.5 18.5v-3"
                stroke={ink}
                strokeWidth="2"
                {...lineProps}
            />
            <path
                d="M16 21v3.25M13.25 24.75h5.5"
                stroke={inkSoft}
                strokeWidth="1.4"
                {...lineProps}
            />
        </>
    );
}

function ArchiveGlyph() {
    return (
        <>
            <path
                d="M14.5 3.25H16v1.5h-1.5zM16 4.75h1.5v1.5H16zM14.5 6.25H16v1.5h-1.5zM16 7.75h1.5v1.5H16zM14.5 9.25H16v1.5h-1.5zM16 10.75h1.5v1.5H16z"
                fill={ink}
            />
            <rect fill={ink} height="7" rx="1.6" width="5" x="13.5" y="13.25" />
            <rect fill={onInk} height="2.5" rx="0.75" width="2" x="15" y="16.5" />
        </>
    );
}

function OtherGlyph() {
    return (
        <g fill={ink}>
            <circle cx="11.5" cy="18" r="1.75" />
            <circle cx="16" cy="18" r="1.75" />
            <circle cx="20.5" cy="18" r="1.75" />
        </g>
    );
}

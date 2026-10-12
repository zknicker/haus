import { ink, inkSoft, onInk, wash } from './artifact-file-glyphs.tsx';
import type { ArtifactFileKind } from './artifact-file-kind.ts';

/**
 * The 16-unit glyph for list rows and tabs, where the full illustration turns
 * to mush. One idea per kind, snapped so it stays crisp at 16px: 1-unit
 * strokes run on half-unit centers with butt ends on whole units, fills sit
 * on whole units. The sheet's inside runs x 3–13, y 2–14 (fold top right).
 */
export function ArtifactFileGlyphSmall({ kind }: { kind: ArtifactFileKind }) {
    switch (kind) {
        case 'document':
            return (
                <>
                    <path d="M4 5.5h4" stroke={ink} {...line} />
                    <path d="M4 8.5h8M4 10.5h8M4 12.5h5" stroke={inkSoft} {...line} />
                </>
            );
        case 'text':
            return <path d="M4 5.5h5M4 7.5h8M4 9.5h7M4 11.5h8" stroke={ink} {...line} />;
        case 'pdf':
            return (
                <>
                    <path d="M4 5.5h4" stroke={inkSoft} {...line} />
                    <rect fill={ink} height="5" rx="1" width="8" x="4" y="8" />
                </>
            );
        case 'image':
            return (
                <>
                    <circle cx="10.5" cy="7.5" fill={inkSoft} r="1.5" />
                    <path d="M4 13v-1l2.6-3.2a.6.6 0 0 1 .93 0L11.5 13z" fill={ink} />
                </>
            );
        case 'video':
            return (
                <path
                    d="M6 6.8v5.4a.6.6 0 0 0 .9.52l4.2-2.7a.6.6 0 0 0 0-1.04l-4.2-2.7a.6.6 0 0 0-.9.52Z"
                    fill={ink}
                />
            );
        case 'audio':
            return <path d="M5.5 8v3M7.5 6v7M9.5 7v5M11.5 8v3" stroke={ink} {...line} />;
        case 'code':
            return (
                <path
                    d="M7 6.5h-.5a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1H7M9 6.5h.5a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1 1 1 0 0 0-1 1v1a1 1 0 0 1-1 1H9"
                    stroke={ink}
                    {...line}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            );
        case 'html':
            return (
                <path
                    d="M7 6.5l-3 3 3 3M9 6.5l3 3-3 3"
                    stroke={ink}
                    {...line}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            );
        case 'spreadsheet':
            return (
                <>
                    <rect {...line} fill={wash} height="6" stroke={ink} width="8" x="4.5" y="6.5" />
                    <path d="M8.5 6.5v6M4.5 9.5h8" stroke={ink} {...line} />
                </>
            );
        case 'slides':
            return (
                <>
                    <rect {...line} fill={wash} height="4" stroke={ink} width="8" x="4.5" y="6.5" />
                    <path d="M8.5 11v1M6 12.5h5" stroke={ink} {...line} />
                </>
            );
        case 'archive':
            return (
                <>
                    <path d="M7 2h1v1H7zM8 3h1v1H8zM7 4h1v1H7zM8 5h1v1H8z" fill={ink} />
                    <rect fill={ink} height="5" rx="1" width="4" x="6" y="7" />
                    <rect fill={onInk} height="1" width="2" x="7" y="9" />
                </>
            );
        case 'other':
            return (
                <g fill={ink}>
                    <circle cx="5" cy="10" r="1" />
                    <circle cx="8" cy="10" r="1" />
                    <circle cx="11" cy="10" r="1" />
                </g>
            );
    }
}

const line = {
    fill: 'none',
    strokeLinecap: 'butt',
    strokeLinejoin: 'miter',
    strokeWidth: 1,
} as const;

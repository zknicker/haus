import { useMemo } from 'react';
import { cn } from '../../lib/utils.ts';
import { buildDiffHunks, type DiffHunk, type DiffLine } from './diff-hunks.ts';

// The one diff renderer: unified view, line numbers, token colors. Used by
// the changed-files drawer and Wiki page history so every diff reads the same.
export function DiffView({
    afterText,
    beforeText,
    className,
    emptyLabel = 'No text changes.',
}: {
    afterText: null | string;
    beforeText: null | string;
    className?: string;
    emptyLabel?: string;
}) {
    const hunks = useMemo(
        () => buildDiffHunks(beforeText ?? '', afterText ?? ''),
        [beforeText, afterText]
    );

    if (hunks.length === 0) {
        return <p className="text-muted text-sm">{emptyLabel}</p>;
    }

    return <DiffHunks className={className} hunks={hunks} />;
}

/** Hunks already computed elsewhere, such as a stored unified patch, in the same renderer. */
export function DiffHunks({
    className,
    hunks,
}: {
    className?: string;
    hunks: readonly DiffHunk[];
}) {
    return (
        <div
            className={cn(
                'card-shell overflow-hidden border border-separator bg-surface font-mono text-sm',
                className
            )}
            data-selectable-text=""
        >
            {hunks.map((hunk, hunkIndex) => (
                <div key={hunk.header}>
                    {hunkIndex > 0 ? (
                        <div className="border-separator border-t bg-default px-3 py-0.5 text-muted text-xs">
                            {hunk.header}
                        </div>
                    ) : null}
                    {hunk.lines.map((line, lineIndex) => (
                        <DiffViewLine key={`${hunk.header}-${String(lineIndex)}`} line={line} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function DiffViewLine({ line }: { line: DiffLine }) {
    return (
        <div
            className={cn(
                'flex min-w-0 leading-5',
                line.kind === 'add' && 'bg-success-soft',
                line.kind === 'del' && 'bg-danger-soft'
            )}
        >
            <span className="w-9 shrink-0 select-none pr-1.5 text-right text-muted tabular-nums">
                {line.oldLine ?? ''}
            </span>
            <span className="w-9 shrink-0 select-none pr-1.5 text-right text-muted tabular-nums">
                {line.newLine ?? ''}
            </span>
            <span
                aria-hidden
                className={cn(
                    'w-4 shrink-0 select-none text-center',
                    line.kind === 'add' && 'text-success',
                    line.kind === 'del' && 'text-danger'
                )}
            >
                {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-3">{line.text}</span>
        </div>
    );
}

export function DiffStatBadge({ additions, deletions }: { additions: number; deletions: number }) {
    if (additions === 0 && deletions === 0) {
        return null;
    }
    return (
        <span className="shrink-0 font-mono text-xs tabular-nums">
            {additions > 0 ? <span className="text-success">+{additions}</span> : null}
            {additions > 0 && deletions > 0 ? ' ' : null}
            {deletions > 0 ? <span className="text-danger">−{deletions}</span> : null}
        </span>
    );
}

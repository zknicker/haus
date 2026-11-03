import type { AgentDreamSummary } from '@haus/api';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { DiffStatBadge } from '../../../components/diff/diff-view.tsx';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { formatDayLabel } from './agent-turn-row-model.ts';
import { formatDreamFiles, formatDreamRowHeadline, isQuietDream } from './dream-model.ts';
import { dreamSummaryHeadline } from './dream-summary-model.ts';

/**
 * One dream as one line on the Recent activity row's columns: the night, the
 * headline with the files it touched, and its line counts. A dream that changed
 * nothing is a quiet, unpressable row; every other row opens the dream's sheet
 * rather than expanding in place.
 */
export function DreamRow({ dream, onOpen }: { dream: AgentDreamSummary; onOpen: () => void }) {
    const now = useRelativeNow();
    const isQuiet = isQuietDream(dream);
    const hasSummary = dreamSummaryHeadline(dream.summary) !== '';
    const line = (
        <ItemCard.Content>
            {/* The row is a flex row in its own right; Content stacks children. */}
            <div className="flex min-w-0">
                <span className="me-2 grid w-0 min-w-0 flex-1 grid-cols-[4.25rem_1rem_minmax(0,1fr)_auto] items-baseline gap-x-2 text-left font-normal text-sm leading-5">
                    <time
                        className="whitespace-nowrap text-muted tabular-nums"
                        dateTime={dream.startedAt}
                    >
                        {formatDayLabel(new Date(dream.startedAt), now)}
                    </time>
                    {/* Recent activity's status column, so titles share one edge. */}
                    <span aria-hidden />
                    {isQuiet ? (
                        <span className="min-w-0 truncate text-muted">No changes</span>
                    ) : (
                        <span className="flex min-w-0 items-baseline gap-1.5">
                            {/* The Agent's own first line leads; the files only name what a headline derived. */}
                            <span
                                className={
                                    hasSummary
                                        ? 'min-w-0 flex-1 truncate text-foreground'
                                        : 'min-w-0 shrink-0 truncate text-foreground'
                                }
                            >
                                {formatDreamRowHeadline(dream)}
                            </span>
                            {hasSummary ? null : (
                                <span className="min-w-0 flex-1 truncate text-muted">
                                    {formatDreamFiles(dream.files)}
                                </span>
                            )}
                        </span>
                    )}
                    <DiffStatBadge additions={dream.added} deletions={dream.removed} />
                </span>
            </div>
        </ItemCard.Content>
    );

    if (isQuiet) {
        return <ItemCard>{line}</ItemCard>;
    }

    return (
        <ItemCard<'button'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onOpen}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            {line}
        </ItemCard>
    );
}

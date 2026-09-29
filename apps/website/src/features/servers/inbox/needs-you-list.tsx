import type { Agent } from '@haus/api';
import { Button } from '@heroui/react';
import { RelativeTime } from '../../../components/time/relative-time.tsx';
import { InboxActionRow, InboxIdentityMark, InboxRowBody } from './inbox-row.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';
import type { NeedsYouRowView } from './needs-you-rows.ts';

/**
 * The conversations addressed to this human, one row each: who wrote, the
 * line they wrote, where and when, and Done. Pressing the row opens the
 * conversation, where replying clears it.
 */
export function NeedsYouList({
    agentById,
    onDone,
    onOpenRow,
    rows,
}: {
    agentById: ReadonlyMap<string, Agent>;
    onDone: (view: NeedsYouRowView) => void;
    onOpenRow: (view: NeedsYouRowView) => void;
    rows: readonly NeedsYouRowView[];
}) {
    return (
        <InboxRowList
            emptyLabel="Nothing needs you."
            listId="inbox-needs-you"
            renderRow={(view) => (
                <InboxActionRow
                    action={
                        <Button
                            aria-label={`Done: ${view.authorName}`}
                            onPress={() => onDone(view)}
                            size="sm"
                            variant="ghost"
                        >
                            Done
                        </Button>
                    }
                    label={view.place ? `${view.authorName} in ${view.place}` : view.authorName}
                    meta={
                        <>
                            {view.place ? <span className="truncate">{view.place}</span> : null}
                            <span className="tabular-nums">
                                <RelativeTime fallback="" value={view.row.latest.createdAt} />
                            </span>
                        </>
                    }
                    onOpen={() => onOpenRow(view)}
                >
                    <InboxIdentityMark
                        agent={(view.authorAgentId && agentById.get(view.authorAgentId)) || null}
                        avatarUrl={view.authorAvatarUrl}
                        name={view.authorName}
                    />
                    <InboxRowBody preview={view.preview} title={view.authorName} />
                </InboxActionRow>
            )}
            rows={rows}
        />
    );
}

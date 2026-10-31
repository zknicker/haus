import type { Agent } from '@haus/api';
import { Chip } from '@heroui/react';
import { ArrowUp02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { opensPlace } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { formatTokens } from '../../stats/usage-format.ts';
import {
    type ActiveAgent,
    activeAgentWindowDays,
    agentWeekLabel,
    stripAgentLimit,
} from './active-agents.ts';
import { HappeningNowList } from './happening-now-list.tsx';
import type { HappeningNowRow } from './happening-now-rows.ts';
import { InboxAgentsList } from './inbox-agents-list.tsx';
import { inboxLayout } from './inbox-layout.ts';
import { InboxStripPopover } from './inbox-strip-popover.tsx';

const chipAvatarSize = 16;

/**
 * The narrow Inbox's one line of Agent activity, between the greeting and
 * Unread: the rail folded down to what a glance needs.
 *
 * It sits straight on the page, in no box of its own. A filled box here was a
 * third material between the page and the cards, and a spiking chip's warning
 * tint fought its grey. The line opens on the rail's own `Tokens · 7d`, so the
 * numbers say what they count before the first one is read.
 *
 * The busiest few Agents ride as chips — face and week total — and the rest
 * fold into "+N", which opens the same ranked list the rail shows. Ranking puts
 * a runaway first, so a spiking chip, tinted warning with an up arrow, is never
 * the one folded away. At the far end "N running" opens Happening now; when
 * nothing runs it is simply not there.
 *
 * It waits for the week to settle, as the rail's list does, rather than
 * drawing chips that reorder when the rest arrive.
 */
export function InboxStrip({
    entries,
    happeningNow,
    onOpenAgent,
    onOpenRow,
}: {
    entries: readonly ActiveAgent[] | null;
    happeningNow: readonly HappeningNowRow[] | null;
    onOpenAgent: (agent: Agent) => void;
    onOpenRow: (row: HappeningNowRow) => void;
}) {
    if (entries === null) {
        return null;
    }
    const shown = entries.slice(0, stripAgentLimit);
    const folded = entries.length - shown.length;
    const running = happeningNow?.length ?? 0;

    return (
        <aside aria-label="Agent activity" className={inboxLayout.strip}>
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <span className="me-1.5 shrink-0 text-muted text-xs">
                        {`Tokens · ${activeAgentWindowDays}d`}
                    </span>
                    {entries.length === 0 ? (
                        <span className="text-muted text-sm">No activity this week.</span>
                    ) : (
                        shown.map((entry) => (
                            <AgentWeekChip
                                entry={entry}
                                key={entry.agent.id}
                                onOpen={() => onOpenAgent(entry.agent)}
                            />
                        ))
                    )}
                    {folded > 0 ? (
                        <InboxStripPopover
                            heading="Agents"
                            label={`Show all ${entries.length} active Agents`}
                            trigger={`+${folded}`}
                        >
                            {(close) => (
                                <InboxAgentsList
                                    entries={entries}
                                    listId="inbox-agents-popover"
                                    onOpenAgent={(agent) => {
                                        close();
                                        onOpenAgent(agent);
                                    }}
                                />
                            )}
                        </InboxStripPopover>
                    ) : null}
                </div>
                {happeningNow !== null && running > 0 ? (
                    <InboxStripPopover
                        heading="Happening now"
                        label={`${running} running now`}
                        trigger={
                            <>
                                <span
                                    aria-hidden="true"
                                    className="size-2 shrink-0 rounded-full bg-success"
                                />
                                {`${running} running`}
                            </>
                        }
                    >
                        {(close) => (
                            <HappeningNowList
                                listId="inbox-happening-now-popover"
                                onOpenRow={(row) => {
                                    close();
                                    onOpenRow(row);
                                }}
                                rows={happeningNow}
                            />
                        )}
                    </InboxStripPopover>
                ) : null}
            </div>
        </aside>
    );
}

/**
 * One Agent as a chip: its face and its week total, pressing through to its
 * DM as a rail row does. The face is bare — no presence dot: the strip counts
 * tokens, and at chip size the dot sat on the number. A spiking Agent's chip
 * takes the warning tint and an up arrow; its accessible name says how far
 * past usual it ran.
 */
function AgentWeekChip({ entry, onOpen }: { entry: ActiveAgent; onOpen: () => void }) {
    const total = formatTokens(entry.totalTokens);
    const spike = entry.spike;

    return (
        <button
            aria-label={agentWeekLabel(entry)}
            className="inline-flex shrink-0 cursor-(--cursor-interactive) rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onOpen}
            type="button"
            {...opensPlace}
        >
            <Chip
                color={spike ? 'warning' : 'default'}
                size="md"
                variant={spike ? 'soft' : 'secondary'}
            >
                <EntityAvatar
                    name={entry.agent.displayName}
                    size={chipAvatarSize}
                    src={entry.agent.avatarUrl}
                />
                <Chip.Label>{total}</Chip.Label>
                {spike ? <Icon icon={ArrowUp02Icon} size={12} strokeWidth={2} /> : null}
            </Chip>
        </button>
    );
}

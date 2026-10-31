import { Chip, Meter } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { ArrowUp02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { Sparkline } from '../../../components/ui/sparkline.tsx';
import { cn } from '../../../lib/utils.ts';
import { AgentAvatar } from '../../members/agent-avatar.tsx';
import { formatTokens } from '../../stats/usage-format.ts';
import {
    type ActiveAgent,
    type AgentSpike,
    agentSpikeLabel,
    agentWeekLabel,
} from './active-agents.ts';
import { InboxRailMark, InboxRailRow, inboxMarkSize } from './inbox-rail-row.tsx';

const sparklineHeight = 14;
const sparklineWidth = 48;

/**
 * One Agent's week as a row of the Agents meter: its face, its name and the
 * tokens it burned this week on the first line, then a bar against the
 * busiest week beside the shape the week came in.
 *
 * The bar answers "who is most active" at a glance down the column; the
 * sparkline answers "is this new". A runaway Agent carries its spike as a chip
 * on the name line and the row takes the warning tint, so it reads before any
 * number does. A working Agent spends one more line on the step it is on, in
 * accent, as the week cards it replaced did.
 */
export function InboxAgentsRow({
    activity,
    onOpen,
    share,
}: {
    activity: ActiveAgent;
    onOpen: () => void;
    /** This week against the busiest one, 0–100. */
    share: number;
}) {
    const isLive = activity.activityLabel !== null;
    const name = activity.agent.displayName;

    return (
        <InboxRailRow
            label={agentWeekLabel(activity)}
            onOpen={onOpen}
            tone={activity.spike === null ? 'default' : 'warning'}
        >
            <InboxRailMark>
                <AgentAvatar agent={activity.agent} size={inboxMarkSize} />
            </InboxRailMark>
            <ItemCard.Content className="gap-1.5">
                <span className="flex min-w-0 items-center gap-2">
                    <ItemCard.Title className="min-w-0 flex-1">{name}</ItemCard.Title>
                    {activity.spike === null ? null : <AgentSpikeChip spike={activity.spike} />}
                    <span className="shrink-0 font-medium text-foreground text-sm tabular-nums">
                        {formatTokens(activity.totalTokens)}
                    </span>
                </span>
                <span className="flex min-w-0 items-center gap-3">
                    <Meter
                        aria-label={`${name}'s week against the busiest Agent's`}
                        className="min-w-0 flex-1"
                        color={isLive ? 'accent' : 'default'}
                        size="sm"
                        value={share}
                    >
                        <Meter.Track>
                            <Meter.Fill />
                        </Meter.Track>
                    </Meter>
                    <Sparkline
                        className={cn('shrink-0', isLive ? 'text-accent' : 'text-muted')}
                        height={sparklineHeight}
                        isLive={isLive}
                        values={activity.days}
                        width={sparklineWidth}
                    />
                </span>
                {isLive ? (
                    <span className="truncate text-accent text-xs">{activity.activityLabel}</span>
                ) : null}
            </ItemCard.Content>
        </InboxRailRow>
    );
}

/**
 * The spike as a stock warning chip: an up arrow and how far past usual today
 * ran. Warning rather than `TrendChip`'s "up", which HeroUI colors as success —
 * a runaway is not good news.
 */
export function AgentSpikeChip({ spike }: { spike: AgentSpike }) {
    return (
        <Chip className="shrink-0" color="warning" size="sm" variant="primary">
            <Icon icon={ArrowUp02Icon} size={12} strokeWidth={2} />
            <Chip.Label>{agentSpikeLabel(spike)}</Chip.Label>
        </Chip>
    );
}

import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { Sparkline } from '../../../components/ui/sparkline.tsx';
import { opensPlace } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { cn } from '../../../lib/utils.ts';
import { AgentAvatar } from '../../members/agent-avatar.tsx';
import { formatTokens } from '../../stats/usage-format.ts';
import { type ActiveAgent, activeAgentUnit } from './active-agents.ts';
import { inboxMarkSize } from './inbox-row.tsx';

const sparklineHeight = 20;
const sparklineWidth = 64;

/**
 * One Agent's week as a card in the strip: its face and name on the header
 * line, then the tokens it processed this week and the shape they came
 * in.
 *
 * The figure leads and the series trails, which is the stat-card grammar
 * everywhere else in the system. A working Agent spends the line under the
 * figure on the step it is on, in accent, so a moving card reads as moving
 * without a second badge saying so.
 *
 * Pressing opens the DM, because the thing a person wants from an Agent they
 * just looked at is to talk to it; an Agent with no DM yet falls back to its
 * profile.
 */
export function AgentWeekCard({
    activity,
    onPress,
}: {
    activity: ActiveAgent;
    onPress: () => void;
}) {
    const isLive = activity.activityLabel !== null;

    return (
        <ItemCard<'button'>
            className="relative w-52 shrink-0 cursor-(--cursor-interactive) snap-start overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={onPress}
            render={(props) => <button type="button" {...props} {...opensPlace} />}
        >
            <PressableFeedback.Highlight />
            <ItemCard.Content className="gap-3">
                {/* The mark and the gap that follows it are the row's, so a
                    card in the strip and a row in the lists below it lead the
                    same way. */}
                <span className="flex min-w-0 items-center gap-3">
                    <AgentAvatar agent={activity.agent} size={inboxMarkSize} />
                    <ItemCard.Title>{activity.agent.displayName}</ItemCard.Title>
                </span>
                <span className="flex items-end justify-between gap-2">
                    <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-semibold text-2xl tabular-nums leading-none tracking-tight">
                            {formatTokens(activity.totalTokens)}
                        </span>
                        <span
                            className={cn(
                                'truncate text-xs',
                                isLive ? 'text-accent' : 'text-muted'
                            )}
                        >
                            {activeAgentUnit(activity)}
                        </span>
                    </span>
                    <Sparkline
                        className={cn('shrink-0', isLive ? 'text-accent' : 'text-muted')}
                        height={sparklineHeight}
                        isLive={isLive}
                        values={activity.days}
                        width={sparklineWidth}
                    />
                </span>
            </ItemCard.Content>
        </ItemCard>
    );
}

import type { Agent } from '@haus/api';
import { Button, Chip, Separator } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import * as React from 'react';
import { useAgentActivityHistory } from '../../../hooks/members/use-agent-activity-history.ts';
import { useAgentTurns } from '../../../hooks/members/use-agent-turns.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { getAgentActivityColor, getAgentActivityPhaseLabel } from './agent-activity-model.ts';
import {
    formatActivityTurnCounts,
    formatActivityTurnHeadline,
    formatActivityTurnTime,
    getActivityTurnPhase,
    groupAgentActivityTurns,
} from './agent-activity-turns.ts';
import { AgentLoading } from './agent-loading.tsx';
import { ProfileListSection } from './profile-list-section.tsx';
import { collapseRecentActivity, type RecentActivityRow } from './recent-activity-rows.ts';

const recentRowLimit = 5;

/**
 * The newest turns as flat rows — what happened, when, and how much of it —
 * with a run of identical failures folded into one row, so a crash loop reads
 * as one fact rather than a wall of the same line. Execution evidence stays in
 * the Activity section: these rows do not expand, so the summary never asks a
 * Computer for a journal nobody opened.
 *
 * Both queries are the Activity section's own, so drilling in reuses the cache
 * rather than refetching the same history under a second key.
 */
export function AgentRecentActivity({
    agent,
    onSeeAll,
    server,
}: {
    agent: Agent;
    onSeeAll: () => void;
    server: ServerDetail;
}) {
    const activity = useAgentActivityHistory(server.id, agent.id);
    const settledTurns = useAgentTurns(server.id, agent.id);
    const rows = collapseRecentActivity(
        groupAgentActivityTurns(activity.events, settledTurns.data ?? []),
        recentRowLimit
    );

    const isPending = activity.isPending && settledTurns.isPending;

    return (
        <ProfileListSection
            action={
                <Button onPress={onSeeAll} size="sm" variant="secondary">
                    See all
                </Button>
            }
            count={undefined}
            title="Recent activity"
        >
            {isPending ? (
                <AgentLoading label="Loading recent activity" />
            ) : rows.length === 0 ? (
                <ProfileListSection.Empty>
                    {activity.error && settledTurns.error
                        ? 'Activity history is unavailable right now.'
                        : 'No activity yet.'}
                </ProfileListSection.Empty>
            ) : (
                rows.map((row, index) => (
                    <React.Fragment key={row.latest.runId}>
                        {index > 0 ? <Separator /> : null}
                        <RecentActivityItem row={row} />
                    </React.Fragment>
                ))
            )}
        </ProfileListSection>
    );
}

function RecentActivityItem({ row }: { row: RecentActivityRow }) {
    const phase = getActivityTurnPhase(row.latest);
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{formatActivityTurnHeadline(row.latest)}</ItemCard.Title>
                <ItemCard.Description className="tabular-nums">
                    {row.count > 1
                        ? `${row.count}× since ${formatActivityTurnTime(row.since)}`
                        : `${formatActivityTurnTime(row.latest.startedAt)} · ${formatActivityTurnCounts(row.latest)}`}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <Chip color={getAgentActivityColor(phase)} size="sm" variant="soft">
                    <Chip.Label>{getAgentActivityPhaseLabel(phase)}</Chip.Label>
                </Chip>
            </ItemCard.Action>
        </ItemCard>
    );
}

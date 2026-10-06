import type { Agent } from '@haus/api';
import { Button, Separator } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import * as React from 'react';
import { useAgentActivityHistory } from '../../../hooks/members/use-agent-activity-history.ts';
import { useAgentTurns } from '../../../hooks/members/use-agent-turns.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { groupAgentActivityTurns } from './agent-activity-turns.ts';
import { AgentLoading } from './agent-loading.tsx';
import { TurnRowContent } from './agent-turn-row.tsx';
import { ProfileListSection } from './profile-list-section.tsx';
import { collapseRecentActivity, type RecentActivityRow } from './recent-activity-rows.ts';
import { useTurnRowTitles } from './use-turn-row-titles.ts';

const recentRowLimit = 5;

/**
 * The newest turns as flat rows — what woke each, what it did, and when —
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

    const isPending = activity.isPending || settledTurns.isPending;

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
                <RecentActivityRows rows={rows} serverId={server.id} />
            )}
        </ProfileListSection>
    );
}

function RecentActivityRows({
    rows,
    serverId,
}: {
    rows: readonly RecentActivityRow[];
    serverId: string;
}) {
    const titleOf = useTurnRowTitles(
        serverId,
        rows.map((row) => row.latest)
    );
    return rows.map((row, index) => (
        <React.Fragment key={row.latest.runId}>
            {index > 0 ? <Separator /> : null}
            <ItemCard>
                <ItemCard.Content>
                    {/* The row is a flex row in its own right; Content stacks children. */}
                    <div className="flex min-w-0">
                        <TurnRowContent row={row} title={titleOf(row.latest)} />
                    </div>
                </ItemCard.Content>
            </ItemCard>
        </React.Fragment>
    ));
}

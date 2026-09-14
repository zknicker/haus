import type { Agent } from '@haus/api';
import { Button, Chip, Separator } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentActivityHistory } from '../../../hooks/members/use-agent-activity-history.ts';
import { useAgentTurns } from '../../../hooks/members/use-agent-turns.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { agentProfileRoute } from '../../servers/server-routes.ts';
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

const recentTurnLimit = 5;

/**
 * The newest turns as flat rows — what happened, when, and how much of it.
 * Execution evidence stays on the Activity tab: these rows do not expand, so
 * the summary never asks a Computer for a journal nobody opened.
 *
 * Both queries are the Activity tab's own, so switching tabs reuses the cache
 * rather than refetching the same history under a second key.
 */
export function AgentRecentActivity({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const activity = useAgentActivityHistory(server.id, agent.id);
    const settledTurns = useAgentTurns(server.id, agent.id);
    const turns = groupAgentActivityTurns(activity.events, settledTurns.data ?? []).slice(
        0,
        recentTurnLimit
    );

    const isPending = activity.isPending && settledTurns.isPending;

    return (
        <ProfileListSection
            action={
                <Button
                    onPress={() => navigate(agentProfileRoute(server.slug, agent.id, 'activity'))}
                    size="sm"
                    variant="secondary"
                >
                    See all
                </Button>
            }
            count={isPending ? undefined : turns.length}
            title="Recent activity"
        >
            {isPending ? (
                <AgentLoading label="Loading recent activity" />
            ) : turns.length === 0 ? (
                <ProfileListSection.Empty>
                    {activity.error && settledTurns.error
                        ? 'Activity history is unavailable right now.'
                        : 'No activity yet.'}
                </ProfileListSection.Empty>
            ) : (
                turns.map((turn, index) => {
                    const phase = getActivityTurnPhase(turn);
                    return (
                        <React.Fragment key={turn.runId}>
                            {index > 0 ? <Separator /> : null}
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>
                                        {formatActivityTurnHeadline(turn)}
                                    </ItemCard.Title>
                                    <ItemCard.Description className="tabular-nums">
                                        {`${formatActivityTurnTime(turn.startedAt)} · ${formatActivityTurnCounts(turn)}`}
                                    </ItemCard.Description>
                                </ItemCard.Content>
                                <ItemCard.Action>
                                    <Chip
                                        color={getAgentActivityColor(phase)}
                                        size="sm"
                                        variant="soft"
                                    >
                                        <Chip.Label>{getAgentActivityPhaseLabel(phase)}</Chip.Label>
                                    </Chip>
                                </ItemCard.Action>
                            </ItemCard>
                        </React.Fragment>
                    );
                })
            )}
        </ProfileListSection>
    );
}

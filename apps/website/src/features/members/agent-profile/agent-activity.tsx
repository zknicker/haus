import type { Agent } from '@haus/api';
import { Button } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import type * as React from 'react';
import { CopyButton } from '../../../components/copy-button.tsx';
import { useAgentActivityHistory } from '../../../hooks/members/use-agent-activity-history.ts';
import { useAgentTurns } from '../../../hooks/members/use-agent-turns.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { useHausServerConnectionState } from '../../../lib/haus-server.tsx';
import { AgentActivityLog } from './agent-activity-log.tsx';
import { formatAgentActivityDiagnosticInfo, getTurnDetailAccess } from './agent-activity-model.ts';
import { groupAgentActivityTurns, withRunTriggers } from './agent-activity-turns.ts';
import { AgentLoading } from './agent-loading.tsx';

/**
 * The Activity tab: one Agent's turns as the full-width event log. The page's
 * trail already names it, so the log starts at its pinned day bar, which also
 * carries the diagnostic copy action.
 */
export function AgentActivity({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const activity = useAgentActivityHistory(server.id, agent.id);
    const settledTurns = useAgentTurns(server.id, agent.id);
    const connectionState = useHausServerConnectionState();
    const events = activity.events;
    const unavailable =
        events.length === 0 && activity.error !== null && settledTurns.error !== null;
    const turns = withRunTriggers(
        groupAgentActivityTurns(events, settledTurns.data ?? []),
        activity.runTriggers
    );

    if (activity.isPending || settledTurns.isPending) {
        return <AgentLoading label="Loading activity history..." />;
    }
    if (unavailable || turns.length === 0) {
        return (
            <ActivityNote>
                {unavailable
                    ? connectionState === 'connecting' || connectionState === 'reconnecting'
                        ? 'Activity history is unavailable while offline. Reconnect to try again.'
                        : 'Activity history is unavailable right now.'
                    : 'No activity yet.'}
            </ActivityNote>
        );
    }
    return (
        <AgentActivityLog
            access={getTurnDetailAccess(server.role)}
            agent={agent}
            dayBarAction={
                <CopyButton
                    label="Copy diagnostic info"
                    value={formatAgentActivityDiagnosticInfo(events)}
                />
            }
            footer={
                activity.hasMore ? (
                    <div className="flex justify-center px-3 py-3">
                        <Button
                            isDisabled={activity.isFetching}
                            onPress={activity.loadMore}
                            size="sm"
                            variant="ghost"
                        >
                            {activity.isFetching
                                ? 'Loading older activity...'
                                : 'Load older activity'}
                        </Button>
                    </div>
                ) : null
            }
            serverId={server.id}
            serverSlug={server.slug}
            turns={turns}
        />
    );
}

/** Empty and error states keep a card's shape instead of a loose line of grey text. */
export function ActivityNote({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-3 pt-4">
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Description>{children}</ItemCard.Description>
                    </ItemCard.Content>
                </ItemCard>
            </ItemCardGroup>
        </div>
    );
}

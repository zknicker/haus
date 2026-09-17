import type { MessageRoutingAudit, MessageRoutingDebug as RoutingDebugData } from '@haus/api';
import { Button, Popover } from '@heroui/react';
import { useDevMode } from '../../../components/dev-mode-provider.tsx';
import { useMessageRouting } from '../../../hooks/servers/use-message-routing.ts';
import { RoutingDecisionPanel } from './routing-decision-panel.tsx';
import { routingOutcomeLabel } from './routing-labels.ts';

export function MessageRoutingDebug({
    serverId,
    messageId,
}: {
    serverId: string;
    messageId: string;
}) {
    const { devMode } = useDevMode();
    return devMode ? <SavedMessageRouting messageId={messageId} serverId={serverId} /> : null;
}

function SavedMessageRouting({ serverId, messageId }: { serverId: string; messageId: string }) {
    const query = useMessageRouting(serverId, messageId);
    if (query.isError) {
        return (
            <Button
                className="text-base"
                onPress={() => void query.refetch()}
                size="md"
                variant="ghost"
            >
                Routing unavailable · retry
            </Button>
        );
    }
    if (!query.data) {
        return null;
    }
    if (!query.data.audit) {
        return <p className="text-base text-muted">Routing not recorded</p>;
    }
    return <MessageRoutingDetails audit={query.data.audit} data={query.data} />;
}

function MessageRoutingDetails({
    data,
    audit,
}: {
    data: RoutingDebugData;
    audit: MessageRoutingAudit;
}) {
    const names = data.agents;
    const recipients =
        audit.recipientAgentIds
            .map((id) => names.find((agent) => agent.id === id)?.displayName ?? id)
            .join(', ') || 'None';
    return (
        <div className="flex min-w-0 items-start" data-message-routing={audit.outcome}>
            <Popover>
                <Button className="max-w-full text-base" size="md" variant="ghost">
                    <span className="truncate">
                        → {recipients} · {routingOutcomeLabel(audit)}
                    </span>
                </Button>
                <Popover.Content className="w-96 max-w-[calc(100vw-2rem)]" placement="bottom start">
                    <Popover.Dialog>
                        <RoutingDecisionPanel agents={data.agents} audit={audit} />
                    </Popover.Dialog>
                </Popover.Content>
            </Popover>
        </div>
    );
}

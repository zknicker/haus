import type { ComputerUseDecision, ComputerUseRequest } from '@haus/api';
import { Button, Card } from '@heroui/react';
import { InlineCard } from '../../../components/ui/inline-card.tsx';
import { useComputerUseDecide } from '../../../hooks/computer-use/use-computer-use-decide.ts';
import { useOpenComputerUseRequests } from '../../../hooks/computer-use/use-computer-use-requests.ts';
import { useAgentMark } from '../../../hooks/members/use-agents.ts';

export function ComputerUseRequests({ chatId, serverId }: { chatId: string; serverId: string }) {
    const requests = useOpenComputerUseRequests(serverId, chatId);
    if (requests.length === 0) {
        return null;
    }
    return (
        <div className="flex flex-col gap-2 px-5 pb-2">
            {requests.map((request) => (
                <ComputerUseRequestPanel key={request.id} request={request} serverId={serverId} />
            ))}
        </div>
    );
}

export function ComputerUseRequestPanel({
    request,
    serverId,
}: {
    request: ComputerUseRequest;
    serverId: string;
}) {
    const captain = useAgentMark(serverId, request.agentId)?.displayName ?? 'A Captain';
    const device = request.computerName ?? 'this Device';
    return (
        <Card aria-label="Permission request" role="region">
            <Card.Header>
                <Card.Description>Permission request</Card.Description>
                <Card.Title>
                    {captain} wants to control applications on {device}
                </Card.Title>
            </Card.Header>
            <Card.Content>
                <InlineCard className="px-3 py-2 font-mono text-sm" tone="surface">
                    <p className="text-foreground break-all">{request.command}</p>
                    <p className="text-muted break-all">
                        {request.detail ? `desktop · ${request.detail}` : 'desktop'}
                    </p>
                </InlineCard>
            </Card.Content>
            <Card.Footer className="justify-end">
                {request.canDecide ? (
                    <ComputerUseDecisions request={request} serverId={serverId} />
                ) : (
                    <p className="text-muted text-sm">
                        Waiting for {request.waitingForName ?? 'the Device’s owner'}
                    </p>
                )}
            </Card.Footer>
        </Card>
    );
}

function ComputerUseDecisions({
    request,
    serverId,
}: {
    request: ComputerUseRequest;
    serverId: string;
}) {
    const decide = useComputerUseDecide(serverId, request.chatId);
    const pressed = decide.isPending ? decide.variables?.decision : undefined;
    const answer = (decision: ComputerUseDecision) =>
        decide.mutate({ decision, requestId: request.id, serverId });
    const button = (decision: ComputerUseDecision) => ({
        isDisabled: pressed !== undefined && pressed !== decision,
        isPending: pressed === decision,
        onPress: () => answer(decision),
        size: 'sm' as const,
    });
    return (
        <div className="flex items-center gap-2">
            <Button {...button('deny')} variant="ghost">
                Deny
            </Button>
            <Button {...button('always')} variant="outline">
                Always allow
            </Button>
            <Button {...button('allow')} variant="primary">
                Allow
            </Button>
        </div>
    );
}

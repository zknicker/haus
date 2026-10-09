import { Button } from '@heroui/react';
import { useStoppedAgentName } from '../../../hooks/members/use-agent.ts';
import { useAgentStart } from '../../../hooks/members/use-agent-start.ts';

/**
 * A stopped Agent's DM still accepts messages, but they wait until someone
 * starts it. Say so above the composer, in the same quiet register as the
 * footer's other notices, and offer Start to the people who may run it.
 */
export function StoppedAgentDmNotice({
    agentId,
    canStart,
    serverId,
}: {
    agentId: string;
    canStart: boolean;
    serverId: string;
}) {
    const stoppedName = useStoppedAgentName(serverId, agentId);
    if (stoppedName === null) {
        return null;
    }
    return (
        <div
            className="mx-auto flex w-full items-center justify-between gap-4 px-9 pb-2 text-muted text-sm"
            data-testid="stopped-agent-dm-notice"
        >
            <p>{stoppedName} is stopped and won’t see new messages until it’s started again.</p>
            {canStart ? <StartAgentButton agentId={agentId} serverId={serverId} /> : null}
        </div>
    );
}

function StartAgentButton({ agentId, serverId }: { agentId: string; serverId: string }) {
    const start = useAgentStart(serverId, agentId);
    return (
        <Button
            isPending={start.isPending}
            onPress={() => void start.start()}
            size="sm"
            variant="outline"
        >
            Start
        </Button>
    );
}

import type { Agent, AgentWakePause } from '@haus/api';
import { Alert, Button } from '@heroui/react';
import { useAgentRestart } from '../../hooks/members/use-agent-restart.ts';
import { agentWakePauseCopy } from './agent-wake-pause-model.ts';

/**
 * The Server stopped waking this Agent automatically after repeated failed
 * turns. Operators get Restart beside the explanation; anyone can lift the
 * pause by sending the Agent a message.
 */
export function AgentWakePauseAlert({
    agent,
    canRestart,
    wakePause,
}: {
    agent: Agent;
    canRestart: boolean;
    wakePause: AgentWakePause;
}) {
    const copy = agentWakePauseCopy({ ...agent, wakePause }, { canRestart });
    return (
        <Alert data-testid="agent-wake-pause" status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{copy.title}</Alert.Title>
                <Alert.Description>{copy.description}</Alert.Description>
            </Alert.Content>
            {canRestart ? <AgentWakePauseRestart agent={agent} /> : null}
        </Alert>
    );
}

function AgentWakePauseRestart({ agent }: { agent: Agent }) {
    const restart = useAgentRestart(agent.serverId, agent.id);
    return (
        <Button
            isPending={restart.isPending}
            onPress={() => void restart.restart()}
            size="sm"
            variant="outline"
        >
            Restart
        </Button>
    );
}

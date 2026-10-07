import { agentStartCommandSchema } from '@haus/api';
import { parseStartCommand } from './agent-command-frames.ts';
import type { AgentWorkCoordinator } from './agent-work-coordinator.ts';
import type { AgentStartCommand, AgentTurnFrame } from './launch.ts';

const startIdentitySchema = agentStartCommandSchema
    .pick({ agentId: true, modelId: true, runId: true, runtimeId: true, type: true })
    .strip();

export async function dispatchAgentStart(
    frame: unknown,
    options: {
        coordinator: Pick<AgentWorkCoordinator, 'waitForConfiguration'>;
        send: (rejection: AgentTurnFrame) => boolean;
        start: (command: AgentStartCommand) => void;
    }
): Promise<void> {
    const command = parseStartCommand(frame);
    if (!command) {
        const rejection = rejectedAgentStart(frame);
        if (rejection) {
            options.send(rejection);
        }
        return;
    }
    await options.coordinator.waitForConfiguration(command.agentId);
    options.start(command);
}

function rejectedAgentStart(frame: unknown): AgentTurnFrame | null {
    const identity = startIdentitySchema.safeParse(frame);
    if (!identity.success) {
        return null;
    }
    const now = new Date().toISOString();
    return {
        ...identity.data,
        activity: { operations: [] },
        endedAt: now,
        failureCode: 'start-rejected',
        failureKind: 'configuration',
        messageCount: 0,
        outputProduced: false,
        startedAt: now,
        status: 'failed',
        summary:
            'Computer rejected the Agent start command because it did not match the execution contract. Update the Computer and restart the Agent.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

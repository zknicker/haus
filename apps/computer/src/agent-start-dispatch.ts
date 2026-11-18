import { agentStartCommandSchema } from '@haus/api';
import { z } from 'zod';

import { parseStartCommand } from './agent-command-frames.ts';
import { rejectedInboxItems } from './agent-inbox-input.ts';
import type { AgentWorkCoordinator } from './agent-work-coordinator.ts';
import type { AgentStartCommand, AgentTurnFrame } from './launch.ts';

// zod rejects .pick()/.omit() on a schema carrying its own .refine() (as
// agentStartCommandSchema does), so this rebuilds the identity subset from
// the canonical field schemas instead of picking them off the refined one.
const startIdentitySchema = z
    .object({
        agentId: agentStartCommandSchema.shape.agentId,
        modelId: agentStartCommandSchema.shape.modelId,
        runId: agentStartCommandSchema.shape.runId,
        runtimeId: agentStartCommandSchema.shape.runtimeId,
        type: agentStartCommandSchema.shape.type,
    })
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
        rejectedItems: rejectedInboxItems(isRecord(frame) ? frame.inbox : undefined),
        startedAt: now,
        status: 'failed',
        summary:
            'Computer rejected the Agent start command because it did not match the execution contract. Update the Computer and restart the Agent.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

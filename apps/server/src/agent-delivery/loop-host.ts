import type { AgentCommand, RunnerDownFrame, RunnerStartFrame } from '@haus/api';
import { eq } from 'drizzle-orm';
import { mintServerRunCredential } from '../computers/runner-credentials.ts';
import { resolveModelConnection } from '../model-connections/agent-model-connection.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import type { DeliveryTransport, DispatchPlan } from './delivery.ts';
import { readDeliveryState } from './store.ts';

export interface AgentLoopHost {
    kind: 'runner';
    machineId?: string;
}

export interface RunnerWire {
    isOnline(): boolean;
    send(frame: RunnerDownFrame): boolean;
}

export type LoopFrame = AgentCommand | RunnerStartFrame;

export const offlineRunner: RunnerWire = { isOnline: () => false, send: () => false };

export class AgentLoopRoute {
    constructor(
        private readonly transport: DeliveryTransport,
        private readonly runner: RunnerWire
    ) {}

    hostOf(computerId: string) {
        const host: AgentLoopHost = { kind: 'runner', machineId: computerId };
        return host;
    }

    hosts(runComputerId: string | null, reporter: AgentLoopHost) {
        return runComputerId !== null && reporter.kind === 'runner';
    }

    isOnline(_host: AgentLoopHost) {
        return this.runner.isOnline();
    }

    send(host: AgentLoopHost, frame: LoopFrame) {
        const sent = this.toRunner(frame);
        if (sent && frame.type === 'runner-start' && host.machineId) {
            this.pullDrive(host.machineId, frame.start);
        }
        return sent;
    }

    toRunner(frame: LoopFrame) {
        const runnerFrame = toRunnerFrame(frame);
        return Boolean(runnerFrame && this.runner.send(runnerFrame));
    }

    private pullDrive(
        machineId: string,
        start: { agentId: string; runId: string; sessionGeneration: number }
    ) {
        if (this.transport.isOnline(machineId)) {
            this.transport.send(machineId, {
                agentId: start.agentId,
                runId: start.runId,
                sessionGeneration: start.sessionGeneration,
                type: 'drive-pull',
            });
        }
    }

    async bindRunCredential(tx: HausDatabase, plan: DispatchPlan) {
        if (plan.suppressSend || plan.frame.type !== 'start') {
            return plan;
        }
        const start = plan.frame;
        // WARNING: every send of a run mints a fresh credential, since only its hash is stored. Revoke by run, never by credential id.
        const runCredential = await mintServerRunCredential(tx, {
            agentId: start.agentId,
            chatId: start.chatId,
            runId: start.runId,
            serverId: plan.serverId,
        });
        const state = await readDeliveryState(tx, start.agentId);
        const reasoningEffort =
            state?.activeRunId === start.runId ? state.activeRunReasoningEffort : null;
        const [agent] = await tx
            .select({ sessionResetKind: agentsTable.sessionResetKind })
            .from(agentsTable)
            .where(eq(agentsTable.id, start.agentId));
        if (!agent) {
            throw new Error(
                `Agent ${start.agentId} is gone, so its run cannot start on the runner.`
            );
        }
        const modelConnectionId = await resolveModelConnection(tx, {
            agentId: start.agentId,
            modelId: start.modelId,
            serverId: plan.serverId,
        });
        const bound: DispatchPlan = {
            ...plan,
            frame: {
                ...(reasoningEffort ? { reasoningEffort } : {}),
                modelConnectionId,
                runCredential,
                sessionResetKind: agent.sessionResetKind,
                start,
                type: 'runner-start',
            },
        };
        return bound;
    }
}

export function startOf(frame: LoopFrame) {
    if (frame.type === 'runner-start') {
        return frame.start;
    }
    return frame.type === 'start' ? frame : null;
}

function toRunnerFrame(frame: LoopFrame) {
    switch (frame.type) {
        case 'runner-start':
        case 'notice':
        case 'stop':
        case 'agent-restart':
        case 'agent-reset':
        case 'agent-retire':
            return frame;
        default:
            return null;
    }
}

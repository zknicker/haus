import type { AgentCommand, RunnerDownFrame, RunnerStartFrame } from '@haus/api';
import { mintServerRunCredential } from '../computers/runner-credentials.ts';
import { resolveModelConnection } from '../model-connections/agent-model-connection.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { DeliveryTransport, DispatchPlan } from './delivery.ts';
import { readDeliveryState } from './store.ts';

export type AgentLoopHost =
    | { computerId: string; kind: 'computer' }
    | { kind: 'runner'; machineId?: string };

export interface RunnerWire {
    isOnline(): boolean;
    send(frame: RunnerDownFrame): boolean;
}

export type AgentLoopWiring = { kind: 'computer' } | { kind: 'runner'; runner: RunnerWire };

export type LoopFrame = AgentCommand | RunnerStartFrame;

export type AgentLoop = AgentLoopHost['kind'];

export function agentLoopWiring(loop: AgentLoop | undefined, runner: RunnerWire) {
    const wiring: AgentLoopWiring =
        loop === 'runner' ? { kind: 'runner', runner } : { kind: 'computer' };
    return wiring;
}

export class AgentLoopRoute {
    constructor(
        private readonly transport: DeliveryTransport,
        private readonly wiring: AgentLoopWiring
    ) {}

    hostOf(computerId: string) {
        const host: AgentLoopHost =
            this.wiring.kind === 'runner'
                ? { kind: 'runner', machineId: computerId }
                : { computerId, kind: 'computer' };
        return host;
    }

    hosts(runComputerId: string | null, reporter: AgentLoopHost) {
        if (runComputerId === null) {
            return false;
        }
        const host = this.hostOf(runComputerId);
        return host.kind === 'runner'
            ? reporter.kind === 'runner'
            : reporter.kind === 'computer' && reporter.computerId === host.computerId;
    }

    isOnline(host: AgentLoopHost) {
        if (host.kind === 'computer') {
            return this.transport.isOnline(host.computerId);
        }
        return this.wiring.kind === 'runner' && this.wiring.runner.isOnline();
    }

    send(host: AgentLoopHost, frame: LoopFrame) {
        if (host.kind === 'computer') {
            return frame.type !== 'runner-start' && this.transport.send(host.computerId, frame);
        }
        const sent = this.toRunner(frame);
        if (sent && frame.type === 'runner-start' && host.machineId) {
            this.pullDrive(host.machineId, frame.start);
        }
        return sent;
    }

    toRunner(frame: LoopFrame) {
        const runnerFrame = toRunnerFrame(frame);
        return Boolean(
            runnerFrame && this.wiring.kind === 'runner' && this.wiring.runner.send(runnerFrame)
        );
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
        if (this.wiring.kind !== 'runner' || plan.suppressSend || plan.frame.type !== 'start') {
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
                start,
                type: 'runner-start',
            },
        };
        return bound;
    }
}

export function hostName(host: AgentLoopHost | null) {
    return host?.kind === 'runner' ? 'runner' : 'assigned Computer';
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

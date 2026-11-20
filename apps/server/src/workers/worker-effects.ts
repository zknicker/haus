import type { AgentCommand } from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import { type PreparedRealtimeEvent, publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';

export interface WorkerFrame {
    computerId: string;
    frame: AgentCommand;
}

export interface WorkerEffects {
    events: PreparedRealtimeEvent[];
    frames: WorkerFrame[];
    wakes: Array<{ agentId: string; serverId: string }>;
}

export interface WorkerEffectSinks {
    agentDelivery: AgentDelivery;
    connections: Pick<ComputerConnections, 'send'>;
    postCommitWork: ServerPostCommitWork;
}

export const noWorkerEffects: WorkerEffects = { events: [], frames: [], wakes: [] };

export function mergeWorkerEffects(...effects: WorkerEffects[]) {
    return {
        events: effects.flatMap((effect) => effect.events),
        frames: effects.flatMap((effect) => effect.frames),
        wakes: effects.flatMap((effect) => effect.wakes),
    } satisfies WorkerEffects;
}

export async function commitWorkerEffects(effects: WorkerEffects, sinks: WorkerEffectSinks) {
    publishRealtime(effects.events);
    for (const { computerId, frame } of effects.frames) {
        sinks.connections.send(computerId, frame);
    }
    await sinks.postCommitWork.wakeAgents(sinks.agentDelivery, effects.wakes);
}

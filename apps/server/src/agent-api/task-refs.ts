import type { TaskActor } from '@haus/api';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';

/** The calling Agent as a Task actor. */
export function agentActor(runner: Pick<ResolvedRunner, 'agentId'>): TaskActor {
    return { agentId: runner.agentId, kind: 'agent' };
}

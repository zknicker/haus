import type { Task } from '@haus/api';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import type { WorkerFrame } from '../workers/worker-effects.ts';

/** Every Task write's result. Publish `events`, wake `wakes`, and send `workerFrames` after commit. */
export interface TaskWriteResult {
    events: PreparedRealtimeEvent[];
    task: Task;
    wakes: { agentId: string; serverId: string }[];
    workerFrames?: WorkerFrame[];
}

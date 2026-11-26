import type { Task } from '@haus/api';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import type { WorkerFrame } from '../workers/worker-effects.ts';
import type { TaskSessionReset } from './task-session.ts';

export interface TaskWriteResult {
    events: PreparedRealtimeEvent[];
    /** Archive and unarchive session resets, announced to the runner and Machine after commit. */
    sessions?: TaskSessionReset[];
    task: Task;
    wakes: { agentId: string; serverId: string }[];
    workerFrames?: WorkerFrame[];
}

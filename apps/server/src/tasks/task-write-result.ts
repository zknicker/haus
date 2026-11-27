import type { Task } from '@haus/api';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import type { TaskSessionReset } from './task-session.ts';

export interface TaskWriteResult {
    events: PreparedRealtimeEvent[];
    sessions?: TaskSessionReset[];
    task: Task;
    wakes: { agentId: string; serverId: string }[];
}

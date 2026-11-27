import * as z from 'zod';

/** How much of a Task's chat a fresh session of it rereads (specs/tasks.md#archive). */
export const TASK_REPLAY_MESSAGES = 50;
export const TASK_REPLAY_MAX_CHARS = 24_000;

export const taskReplayMessageSchema = z
    .object({
        /** The author's handle, or `haus` for a message no person or agent wrote. */
        author: z.string().min(1).max(128),
        body: z.string().max(32_000),
        createdAt: z.iso.datetime({ offset: true }),
        id: z.string().min(1).max(128),
        sequence: z.number().int().positive(),
    })
    .strict();

/**
 * `GET /api/agent/tasks/replay?before=<sequence>`: the Task chat the runner replays when a Task's
 * session starts fresh, as after unarchive. `brief` is the chat's first message, null when nothing
 * comes before `before`; `messages` are the newest messages after it and before `before`, oldest
 * first, so the brief is never among them.
 */
export const taskReplaySchema = z
    .object({
        brief: taskReplayMessageSchema.nullable(),
        messages: z.array(taskReplayMessageSchema).max(TASK_REPLAY_MESSAGES),
    })
    .strict();

export const taskReplayQuerySchema = z
    .object({ before: z.coerce.number().int().positive().optional() })
    .strict();

export type TaskReplay = z.infer<typeof taskReplaySchema>;
export type TaskReplayMessage = z.infer<typeof taskReplayMessageSchema>;

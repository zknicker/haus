import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { cloudAgentPullRequestReadingSchema, cloudAgentWorkSchema } from './cloud-agent-shared.ts';
import { taskKeySchema, taskLinkSchema } from './task-key.ts';
import { taskPriorities } from './task-labels.ts';
import { isClosedTaskState, type TaskState, taskStateSchema } from './task-state.ts';

export const TASK_TITLE_MAX_CHARS = 200;
export const TASK_DESCRIPTION_MAX_CHARS = 20_000;

export const taskTitleSchema = z.string().trim().min(1).max(TASK_TITLE_MAX_CHARS);
export const taskDescriptionSchema = z.string().max(TASK_DESCRIPTION_MAX_CHARS);
/** Display only: it sorts and badges, and wakes nothing. */
export const taskDueOnSchema = z.iso.date();
export const taskPrioritySchema = z.enum(taskPriorities);

/** A person or an Agent of the Server: a Task's creator, assignee, or assigner. */
export const taskActorSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('user'), userId: idSchema }).strict(),
    z.object({ kind: z.literal('agent'), agentId: idSchema }).strict(),
]);

/** At most one assignee: an active human member or a non-deleted Agent. */
export const taskAssigneeSchema = taskActorSchema;

export type TaskActor = z.infer<typeof taskActorSchema>;
export type TaskAssignee = z.infer<typeof taskAssigneeSchema>;

/** The Channel Message a Task started from (ADR 0053 decision 3). */
export const taskOriginSchema = z.object({ chatId: idSchema, messageId: idSchema }).strict();

export type TaskOrigin = z.infer<typeof taskOriginSchema>;

const taskFields = {
    assignee: taskAssigneeSchema.nullable(),
    /**
     * The Task's own conversation: a `task` Chat (ADR 0053). Null for a Task
     * from before Tasks were places, kept as read-only history.
     */
    chatId: idSchema.nullable(),
    /** Set exactly while the Task is `done` or `canceled`. */
    completedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    createdBy: taskActorSchema,
    description: taskDescriptionSchema,
    dueOn: taskDueOnSchema.nullable(),
    id: idSchema,
    key: taskKeySchema,
    /** The key-ledger entry numbering this Task (`taskKey.list`). */
    keyId: idSchema,
    labelIds: z.array(idSchema),
    number: z.number().int().positive(),
    /** The Channel Message it started from; null for a Task from before ADR 0053. */
    origin: taskOriginSchema.nullable(),
    priority: taskPrioritySchema,
    serverId: idSchema,
    state: taskStateSchema,
    title: taskTitleSchema,
    updatedAt: timestampSchema,
    version: z.number().int().positive(),
};

export const taskSchema = z.object(taskFields).strict().superRefine(checkTaskRecord);

export type Task = z.infer<typeof taskSchema>;

/**
 * Where a message that references a Task lives, named without a second read:
 * the Channel or DM it sits in, or for a message in a Task's own Chat, the
 * Channel that Task started in.
 */
export const taskMessagePlaceSchema = z
    .object({
        /** The Channel or DM: the message's own Chat, or its Task's origin Channel. */
        chatId: idSchema,
        chatKind: z.enum(['channel', 'dm']),
        /** The Channel's name. Null for a DM, which a context label never names by its peer. */
        chatName: z.string().min(1).nullable(),
    })
    .strict()
    .refine((place) => (place.chatKind === 'dm') === (place.chatName === null), {
        message: 'A Channel has a name and a DM has none.',
        path: ['chatName'],
    });

export type TaskMessagePlace = z.infer<typeof taskMessagePlaceSchema>;

/** A message that references the Task: its **Mentioned in**, newest first. */
export const taskMentionSchema = z
    .object({
        authorLabel: z.string().min(1),
        /** The message's own Chat: a Task's Chat for a message in a Task. */
        chatId: idSchema,
        createdAt: timestampSchema,
        excerpt: z.string().max(500),
        messageId: idSchema,
        place: taskMessagePlaceSchema,
    })
    .strict();

/**
 * A Reminder on the Task: set on it (anchored in its own Chat, ADR 0053
 * decision 16) or one whose description references it. Its **Reminders**.
 */
export const taskReminderRefSchema = z
    .object({
        anchorChatId: idSchema,
        kind: z.enum(['once', 'recurring']),
        /** Null once a one-shot fired or the Reminder was canceled. */
        nextFireAt: timestampSchema.nullable(),
        reminderId: idSchema,
        /** The Agent that set it; a retired Agent keeps its stored name. */
        setBy: z.object({ agentId: idSchema, displayName: z.string().min(1) }).strict(),
        title: z.string().min(1),
    })
    .strict();

export const taskDetailSchema = z
    .object({
        ...taskFields,
        /** Cloud Agent work attached to this Task, newest first (ADR 0053 decision 6). */
        attachedWork: z.array(cloudAgentWorkSchema),
        /**
         * The description as clients render it, resolved when read: the bare
         * `@handle`, `#channel`, and `#channel:shortid` tokens an Agent's Message
         * has rewritten into references when written, rewritten the same way.
         * Never stored; `description` stays the source a reader edits.
         */
        descriptionContent: z.string(),
        /** The Task references in `descriptionContent`, like a Message's `taskLinks`. */
        descriptionTaskLinks: z.array(taskLinkSchema),
        /** Whether the viewer follows the Task, so it can be unread for them (decision 9). */
        followed: z.boolean(),
        mentions: z.array(taskMentionSchema),
        /** Pull requests attached to this Task, as the Server last read them. */
        pullRequests: z.array(cloudAgentPullRequestReadingSchema),
        reminders: z.array(taskReminderRefSchema),
        /** The viewer's unread messages in the Task's Chat; zero unless followed. */
        unreadCount: z.number().int().nonnegative(),
    })
    .strict()
    .superRefine(checkTaskRecord);

export type TaskMention = z.infer<typeof taskMentionSchema>;
export type TaskReminderRef = z.infer<typeof taskReminderRefSchema>;
export type TaskDetail = z.infer<typeof taskDetailSchema>;

export const taskListSchema = z.array(taskSchema);

export const taskMutationResultSchema = z.object({ task: taskSchema }).strict();

export type TaskMutationResult = z.infer<typeof taskMutationResultSchema>;

/**
 * `task.onCreated` / `task.onUpdated`: a Task was created, or edited, had its
 * state changed, or was assigned. Every member. Ids only: the App invalidates
 * that Task and the Task lists.
 */
export const taskCreatedEventSchema = z
    .object({
        /** The Task's own Chat; null for a chatless history Task (see `Task.chatId`). */
        chatId: idSchema.nullable(),
        serverId: idSchema,
        taskId: idSchema,
        version: z.number().int().positive(),
    })
    .strict();

export const taskUpdatedEventSchema = taskCreatedEventSchema;

/**
 * `task.onFollowUpdated`: the subscriber followed or unfollowed a Task. Reader
 * only. Names the Task's Chat so the App invalidates that Task and its unread.
 */
export const taskFollowUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        followed: z.boolean(),
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

export type TaskCreatedEvent = z.infer<typeof taskCreatedEventSchema>;
export type TaskUpdatedEvent = z.infer<typeof taskUpdatedEventSchema>;
export type TaskFollowUpdatedEvent = z.infer<typeof taskFollowUpdatedEventSchema>;

function checkTaskRecord(
    task: { completedAt: string | null; key: string; number: number; state: TaskState },
    context: z.RefinementCtx
) {
    if ((task.completedAt !== null) !== isClosedTaskState(task.state)) {
        context.addIssue({
            code: 'custom',
            message: 'completedAt is set exactly while the Task is done or canceled.',
            path: ['completedAt'],
        });
    }
    if (!task.key.endsWith(`-${task.number}`)) {
        context.addIssue({
            code: 'custom',
            message: 'A Task key ends with its number.',
            path: ['key'],
        });
    }
}

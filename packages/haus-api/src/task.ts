import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { taskLinkSchema, taskShortIdSchema } from './task-short-id.ts';
import { pullRequestReadingSchema, workerSchema } from './worker-shared.ts';

export const TASK_TITLE_MAX_CHARS = 200;
export const TASK_DESCRIPTION_MAX_CHARS = 20_000;

export const taskTitleSchema = z.string().trim().min(1).max(TASK_TITLE_MAX_CHARS);
export const taskDescriptionSchema = z.string().max(TASK_DESCRIPTION_MAX_CHARS);

/** A person or an Agent of the Server: who started a Task, or who acts on one. */
export const taskActorSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('user'), userId: idSchema }).strict(),
    z.object({ kind: z.literal('agent'), agentId: idSchema }).strict(),
]);

export type TaskActor = z.infer<typeof taskActorSchema>;

/**
 * The Message a Task started from: in a Channel, which need not be the Task's
 * Project, or in a DM, shown only to readers of that DM. Null for a filed Task
 * and once the origin's Chat is deleted.
 */
export const taskOriginSchema = z.object({ chatId: idSchema, messageId: idSchema }).strict();

export type TaskOrigin = z.infer<typeof taskOriginSchema>;

const taskFields = {
    archivedAt: timestampSchema.nullable(),
    chatId: idSchema.nullable(),
    createdAt: timestampSchema,
    createdBy: taskActorSchema,
    description: taskDescriptionSchema,
    id: idSchema,
    origin: taskOriginSchema.nullable(),
    projectId: idSchema,
    serverId: idSchema,
    shortId: taskShortIdSchema,
    title: taskTitleSchema,
    updatedAt: timestampSchema,
    version: z.number().int().positive(),
};

export const taskSchema = z.object(taskFields).strict();

export type Task = z.infer<typeof taskSchema>;

/**
 * Where a message that references a Task lives, named without a second read:
 * the Channel or DM it sits in, or for a message in a Task's own Chat, the
 * Channel that Task started in.
 */
export const taskMessagePlaceSchema = z
    .object({
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
        setBy: z.object({ agentId: idSchema, displayName: z.string().min(1) }).strict(),
        title: z.string().min(1),
    })
    .strict();

export const taskDetailSchema = z
    .object({
        ...taskFields,
        attachedWork: z.array(workerSchema),
        /**
         * The description as clients render it, resolved when read: the bare
         * `@handle`, `#channel`, and `#channel:shortid` tokens an Agent's Message
         * has rewritten into references when written, rewritten the same way.
         * Never stored; `description` stays the source a reader edits.
         */
        descriptionContent: z.string(),
        /** The Task references in `descriptionContent`, like a Message's `taskLinks`. */
        descriptionTaskLinks: z.array(taskLinkSchema),
        followed: z.boolean(),
        mentions: z.array(taskMentionSchema),
        pullRequests: z.array(pullRequestReadingSchema),
        reminders: z.array(taskReminderRefSchema),
        unreadCount: z.number().int().nonnegative(),
    })
    .strict();

export type TaskMention = z.infer<typeof taskMentionSchema>;
export type TaskReminderRef = z.infer<typeof taskReminderRefSchema>;
export type TaskDetail = z.infer<typeof taskDetailSchema>;

export const taskListSchema = z.array(taskSchema);

export const taskMutationResultSchema = z.object({ task: taskSchema }).strict();

export type TaskMutationResult = z.infer<typeof taskMutationResultSchema>;

/**
 * `task.onCreated` / `task.onUpdated`: a Task was created, edited, archived, or
 * unarchived. Every member. Ids only: the App invalidates that Task and the
 * Task lists.
 */
export const taskCreatedEventSchema = z
    .object({
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

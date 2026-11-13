import * as z from 'zod';
import { type ColumnCategory, columnCategorySchema, isClosedColumnCategory } from './board.ts';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { taskKeySchema } from './task-key.ts';
import { taskPriorities } from './task-labels.ts';

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

const taskFields = {
    assignee: taskAssigneeSchema.nullable(),
    boardId: idSchema,
    /** The category of `columnId`'s column, derived when read. */
    category: columnCategorySchema,
    columnId: idSchema,
    /** Set while the Task sits in a `done` or `canceled` column. */
    completedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    createdBy: taskActorSchema,
    description: taskDescriptionSchema,
    dueOn: taskDueOnSchema.nullable(),
    id: idSchema,
    key: taskKeySchema,
    labelIds: z.array(idSchema),
    number: z.number().int().positive(),
    priority: taskPrioritySchema,
    serverId: idSchema,
    title: taskTitleSchema,
    updatedAt: timestampSchema,
    version: z.number().int().positive(),
};

export const taskSchema = z.object(taskFields).strict().superRefine(checkTaskRecord);

export type Task = z.infer<typeof taskSchema>;

/**
 * Where a message that references a Task lives, named without a second read:
 * the Channel or DM it sits in or under, and the Thread when it is a Thread
 * reply. A Thread reply's own Chat is outside `chat.list`, so this is what
 * labels it `#security · Thread` and opens or answers it.
 */
export const taskMessagePlaceSchema = z
    .object({
        /** The Channel or DM: the message's own Chat, or the one its Thread hangs off. */
        chatId: idSchema,
        chatKind: z.enum(['channel', 'dm']),
        /** The Channel's name. Null for a DM, which a context label never names by its peer. */
        chatName: z.string().min(1).nullable(),
        /** The message the Thread hangs off when this is a Thread reply; null otherwise. */
        threadAnchorMessageId: idSchema.nullable(),
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
        /** The message's own Chat: a Thread's Chat for a Thread reply. */
        chatId: idSchema,
        createdAt: timestampSchema,
        excerpt: z.string().max(500),
        messageId: idSchema,
        place: taskMessagePlaceSchema,
    })
    .strict();

/** A Reminder whose description references the Task: its **Reminders**. */
export const taskReminderRefSchema = z
    .object({
        anchorChatId: idSchema,
        kind: z.enum(['once', 'recurring']),
        /** Null once a one-shot fired or the Reminder was canceled. */
        nextFireAt: timestampSchema.nullable(),
        reminderId: idSchema,
        title: z.string().min(1),
    })
    .strict();

export const taskDetailSchema = z
    .object({
        ...taskFields,
        mentions: z.array(taskMentionSchema),
        reminders: z.array(taskReminderRefSchema),
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
 * `task.onCreated` / `task.onUpdated`: a Task was created, or edited, moved,
 * or assigned. Every member. Ids only: the App invalidates that Task and its
 * board's lists.
 */
export const taskCreatedEventSchema = z
    .object({
        boardId: idSchema,
        serverId: idSchema,
        taskId: idSchema,
        version: z.number().int().positive(),
    })
    .strict();

export const taskUpdatedEventSchema = taskCreatedEventSchema;

export type TaskCreatedEvent = z.infer<typeof taskCreatedEventSchema>;
export type TaskUpdatedEvent = z.infer<typeof taskUpdatedEventSchema>;

function checkTaskRecord(
    task: { category: ColumnCategory; completedAt: string | null; key: string; number: number },
    context: z.RefinementCtx
) {
    if ((task.completedAt !== null) !== isClosedColumnCategory(task.category)) {
        context.addIssue({
            code: 'custom',
            message: 'completedAt is set exactly while the Task is in a done or canceled column.',
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

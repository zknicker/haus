import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

export const ISSUE_TITLE_MAX_CHARS = 500;
export const ISSUE_DESCRIPTION_MAX_CHARS = 20_000;
export const ISSUE_LABELS_MAX = 20;

export const ISSUE_CODE_PATTERN = /^([A-Z][A-Z0-9]{1,4})-([1-9][0-9]*)$/u;

export const issueCodeSchema = z.string().trim().regex(ISSUE_CODE_PATTERN, {
    message: 'An Issue code is a Project key and a number, like GEN-12.',
});

export function formatIssueCode(key: string, number: number) {
    return `${key}-${number}`;
}

export function parseIssueCode(code: string) {
    const match = ISSUE_CODE_PATTERN.exec(code);
    if (!match) {
        return null;
    }
    const number = Number(match[2]);
    return Number.isSafeInteger(number) ? { key: match[1], number } : null;
}

export const issueStates = ['backlog', 'todo', 'in_progress', 'done', 'canceled'] as const;
export const issueStateSchema = z.enum(issueStates);
export type IssueState = z.infer<typeof issueStateSchema>;

export const closedIssueStates = ['done', 'canceled'] as const satisfies readonly IssueState[];
export const openIssueStates = [
    'backlog',
    'todo',
    'in_progress',
] as const satisfies readonly IssueState[];

export type IssueStateType = 'open' | 'closed';

export function issueStateType(state: IssueState): IssueStateType {
    return (closedIssueStates as readonly IssueState[]).includes(state) ? 'closed' : 'open';
}

export const issueStateRefSchema = z
    .object({ id: issueStateSchema, type: z.enum(['open', 'closed']) })
    .strict()
    .refine((state) => issueStateType(state.id) === state.type, {
        message: 'backlog, todo and in_progress are open; done and canceled are closed.',
        path: ['type'],
    });

export const issuePriorities = ['urgent', 'high', 'normal', 'low'] as const;
export const issuePrioritySchema = z.enum(issuePriorities);
export type IssuePriority = z.infer<typeof issuePrioritySchema>;

export const issueTitleSchema = z.string().trim().min(1).max(ISSUE_TITLE_MAX_CHARS);
export const issueDescriptionSchema = z.string().max(ISSUE_DESCRIPTION_MAX_CHARS);
export const issueDueOnSchema = z.iso.date();
export const issueLabelIdsSchema = z
    .array(idSchema)
    .max(ISSUE_LABELS_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Label ids must be unique.');

export const issueActorSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('user'), userId: idSchema }).strict(),
    z.object({ agentId: idSchema, kind: z.literal('captain') }).strict(),
    z.object({ kind: z.literal('task'), taskId: idSchema }).strict(),
]);

export type IssueActor = z.infer<typeof issueActorSchema>;

export const issueAssigneeSchema = issueActorSchema;
export type IssueAssignee = IssueActor;

export function sameIssueActor(left: IssueActor | null, right: IssueActor | null) {
    if (left === null || right === null) {
        return left === right;
    }
    switch (left.kind) {
        case 'user':
            return right.kind === 'user' && right.userId === left.userId;
        case 'captain':
            return right.kind === 'captain' && right.agentId === left.agentId;
        case 'task':
            return right.kind === 'task' && right.taskId === left.taskId;
    }
}

const issueFields = {
    assignee: issueAssigneeSchema.nullable(),
    closedAt: timestampSchema.nullable(),
    closedSubIssueCount: z.number().int().nonnegative(),
    code: issueCodeSchema,
    createdAt: timestampSchema,
    creator: issueActorSchema,
    description: issueDescriptionSchema,
    dueOn: issueDueOnSchema.nullable(),
    id: idSchema,
    labelIds: z.array(idSchema),
    number: z.number().int().positive(),
    parentId: idSchema.nullable(),
    priority: issuePrioritySchema,
    projectId: idSchema,
    serverId: idSchema,
    state: issueStateRefSchema,
    subIssueCount: z.number().int().nonnegative(),
    taskIds: z.array(idSchema),
    title: issueTitleSchema,
    updatedAt: timestampSchema,
    version: z.number().int().positive(),
};

export const issueSchema = z.object(issueFields).strict().superRefine(checkIssueRecord);

export type Issue = z.infer<typeof issueSchema>;

export const issueListSchema = z.array(issueSchema);

export const issueMutationResultSchema = z.object({ issue: issueSchema }).strict();

export type IssueMutationResult = z.infer<typeof issueMutationResultSchema>;

export const issueCreatedEventSchema = z
    .object({
        issueId: idSchema,
        projectId: idSchema,
        serverId: idSchema,
        version: z.number().int().positive(),
    })
    .strict();

export const issueUpdatedEventSchema = issueCreatedEventSchema;

export const issueCommentedEventSchema = z
    .object({ commentId: idSchema, issueId: idSchema, serverId: idSchema })
    .strict();

export const issueSubscriptionUpdatedEventSchema = z
    .object({ issueId: idSchema, serverId: idSchema, subscribed: z.boolean() })
    .strict();

export type IssueCreatedEvent = z.infer<typeof issueCreatedEventSchema>;
export type IssueUpdatedEvent = z.infer<typeof issueUpdatedEventSchema>;
export type IssueCommentedEvent = z.infer<typeof issueCommentedEventSchema>;
export type IssueSubscriptionUpdatedEvent = z.infer<typeof issueSubscriptionUpdatedEventSchema>;

function checkIssueRecord(
    issue: { closedAt: string | null; code: string; number: number; state: { id: IssueState } },
    context: z.RefinementCtx
) {
    if ((issue.closedAt !== null) !== (issueStateType(issue.state.id) === 'closed')) {
        context.addIssue({
            code: 'custom',
            message: 'closedAt is set exactly while the Issue is done or canceled.',
            path: ['closedAt'],
        });
    }
    if (!issue.code.endsWith(`-${issue.number}`)) {
        context.addIssue({
            code: 'custom',
            message: 'An Issue code ends with its number.',
            path: ['code'],
        });
    }
}

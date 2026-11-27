import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { issueCommentBodySchema, issueEventKinds } from './issue-timeline.ts';
import {
    issueCodeSchema,
    issueDescriptionSchema,
    issueDueOnSchema,
    issuePrioritySchema,
    issueStateSchema,
    issueTitleSchema,
} from './issue.ts';
import { taskKeyPrefixSchema } from './task-key-ledger.ts';
import { pullRequestStates } from './pull-request.ts';

export const agentIssueRefusalCodes = [
    'ISSUE_TAKEN',
    'ISSUE_ASSIGNEE_ARCHIVED',
    'ISSUE_PARENT_PROJECT',
    'ISSUE_PARENT_CYCLE',
    'ISSUE_PROJECT_NOT_HOME',
] as const;

export type AgentIssueRefusalCode = (typeof agentIssueRefusalCodes)[number];

export const ISSUE_ASSIGNEE_REF_PATTERN = /^(me|@\S+|task:\S+)$/u;

const assigneeRefSchema = z.string().trim().regex(ISSUE_ASSIGNEE_REF_PATTERN, {
    message: 'An assignee is me, an @handle, or task:<id>.',
});
const labelNamesSchema = z.array(z.string().trim().min(1).max(80)).max(20);
const expectedVersionSchema = z.number().int().positive();

const commaListSchema = z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
        (Array.isArray(value) ? value : [value]).flatMap((part) => part.split(','))
    );

export const agentIssueListQuerySchema = z.object({
    assignee: z.union([assigneeRefSchema, z.literal('none')]).optional(),
    parent: issueCodeSchema.optional(),
    project: taskKeyPrefixSchema.optional(),
    query: z.string().trim().min(1).max(200).optional(),
    state: commaListSchema.pipe(z.array(issueStateSchema).min(1)).optional(),
});

export const agentIssueShowQuerySchema = z.object({ code: issueCodeSchema });

const agentIssueFields = {
    assignee: assigneeRefSchema.nullable().optional(),
    description: issueDescriptionSchema.optional(),
    dueOn: issueDueOnSchema.nullable().optional(),
    labels: labelNamesSchema.optional(),
    parent: issueCodeSchema.nullable().optional(),
    priority: issuePrioritySchema.optional(),
    state: issueStateSchema.optional(),
};

export const agentIssueCreateInputSchema = z
    .object({ ...agentIssueFields, title: issueTitleSchema })
    .strict();

export const agentIssueUpdateInputSchema = z
    .object({
        ...agentIssueFields,
        code: issueCodeSchema,
        expectAssignee: assigneeRefSchema.nullable().optional(),
        expectedVersion: expectedVersionSchema.optional(),
        title: issueTitleSchema.optional(),
    })
    .strict()
    .refine(
        ({ assignee, description, dueOn, labels, parent, priority, state, title }) =>
            [assignee, description, dueOn, labels, parent, priority, state, title].some(
                (field) => field !== undefined
            ),
        'Provide at least one Issue field.'
    );

export const agentIssueCommentInputSchema = z
    .object({ body: issueCommentBodySchema, code: issueCodeSchema, replyTo: idSchema.optional() })
    .strict();

export const agentIssueLinkInputSchema = z
    .object({ code: issueCodeSchema, taskId: idSchema })
    .strict();

export const agentIssueActorSchema = z.discriminatedUnion('kind', [
    z.object({ handle: z.string().nullable(), kind: z.literal('user') }).strict(),
    z.object({ handle: z.string().nullable(), kind: z.literal('captain') }).strict(),
    z.object({ kind: z.literal('task'), taskId: idSchema, title: z.string() }).strict(),
]);

export const agentIssueRowSchema = z
    .object({
        assignee: agentIssueActorSchema.nullable(),
        closedSubIssueCount: z.number().int().nonnegative(),
        code: issueCodeSchema,
        createdAt: timestampSchema,
        creator: agentIssueActorSchema,
        dueOn: z.string().nullable(),
        labels: z.array(z.string()),
        parent: issueCodeSchema.nullable(),
        priority: issuePrioritySchema,
        state: issueStateSchema,
        subIssueCount: z.number().int().nonnegative(),
        taskIds: z.array(idSchema),
        title: z.string(),
        updatedAt: timestampSchema,
        version: z.number().int().positive(),
    })
    .strict();

export const agentIssueCommentRowSchema = z
    .object({
        author: agentIssueActorSchema,
        body: z.string(),
        createdAt: timestampSchema,
        id: idSchema,
        parentCommentId: idSchema.nullable(),
        replyToCommentId: idSchema.nullable(),
    })
    .strict();

export const agentIssueActivityRowSchema = z
    .object({
        actor: agentIssueActorSchema.nullable(),
        createdAt: timestampSchema,
        from: z.string().nullable(),
        kind: z.enum(issueEventKinds),
        to: z.string().nullable(),
    })
    .strict();

export const agentIssueListResponseSchema = z
    .object({ issues: z.array(agentIssueRowSchema), omitted: z.number().int().nonnegative() })
    .strict();

export const agentIssueSingleResponseSchema = z.object({ issue: agentIssueRowSchema }).strict();

export const agentIssueShowResponseSchema = z
    .object({
        activity: z.array(agentIssueActivityRowSchema),
        comments: z.array(agentIssueCommentRowSchema),
        description: z.string(),
        issue: agentIssueRowSchema,
        pullRequests: z.array(
            z
                .object({
                    number: z.number().int().positive(),
                    repository: z.string(),
                    state: z.enum(pullRequestStates).nullable(),
                })
                .strict()
        ),
        subIssues: z.array(agentIssueRowSchema),
    })
    .strict();

export const agentIssueCommentResponseSchema = z
    .object({ comment: agentIssueCommentRowSchema })
    .strict();

export type AgentIssueListQuery = z.infer<typeof agentIssueListQuerySchema>;
export type AgentIssueCreateInput = z.infer<typeof agentIssueCreateInputSchema>;
export type AgentIssueUpdateInput = z.infer<typeof agentIssueUpdateInputSchema>;
export type AgentIssueCommentInput = z.infer<typeof agentIssueCommentInputSchema>;
export type AgentIssueLinkInput = z.infer<typeof agentIssueLinkInputSchema>;
export type AgentIssueActor = z.infer<typeof agentIssueActorSchema>;
export type AgentIssueRow = z.infer<typeof agentIssueRowSchema>;
export type AgentIssueCommentRow = z.infer<typeof agentIssueCommentRowSchema>;
export type AgentIssueActivityRow = z.infer<typeof agentIssueActivityRowSchema>;
export type AgentIssueShowResponse = z.infer<typeof agentIssueShowResponseSchema>;

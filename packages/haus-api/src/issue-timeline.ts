import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import {
    issueActorSchema,
    issueCodeSchema,
    issueDueOnSchema,
    issuePrioritySchema,
    issueSchema,
    issueStateSchema,
    issueTitleSchema,
} from './issue.ts';
import { workerPullRequestStates } from './worker-pull-request.ts';

export const ISSUE_COMMENT_MAX_CHARS = 20_000;

export const issueCommentBodySchema = z.string().trim().min(1).max(ISSUE_COMMENT_MAX_CHARS);

export const issueCommentSchema = z
    .object({
        author: issueActorSchema,
        body: issueCommentBodySchema,
        createdAt: timestampSchema,
        editedAt: timestampSchema.nullable(),
        id: idSchema,
        issueId: idSchema,
        parentCommentId: idSchema.nullable(),
        replyToCommentId: idSchema.nullable(),
    })
    .strict()
    .refine((comment) => (comment.parentCommentId === null) === (comment.replyToCommentId === null), {
        message: 'A reply names both its top-level comment and the comment it answers.',
        path: ['replyToCommentId'],
    });

export type IssueComment = z.infer<typeof issueCommentSchema>;

const change = <Kind extends string, Value extends z.ZodType>(kind: Kind, value: Value) =>
    z.object({ from: value, kind: z.literal(kind), to: value }).strict();

const issueRef = <Kind extends string>(kind: Kind) =>
    z.object({ issue: issueCodeSchema, kind: z.literal(kind) }).strict();

const taskRef = <Kind extends string>(kind: Kind) =>
    z.object({ kind: z.literal(kind), taskId: idSchema }).strict();

export const issueChangeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('created') }).strict(),
    change('state_changed', issueStateSchema),
    change('priority_changed', issuePrioritySchema),
    change('assignee_changed', issueActorSchema.nullable()),
    change('title_changed', issueTitleSchema),
    z.object({ kind: z.literal('description_edited') }).strict(),
    change('parent_set', issueCodeSchema.nullable()),
    issueRef('sub_issue_added'),
    issueRef('sub_issue_removed'),
    taskRef('linked'),
    taskRef('unlinked'),
    change('due_changed', issueDueOnSchema.nullable()),
    change('labels_changed', z.array(idSchema)),
]);

export type IssueChange = z.infer<typeof issueChangeSchema>;
export type IssueEventKind = IssueChange['kind'];

export const issueEventKinds = [
    'created',
    'state_changed',
    'priority_changed',
    'assignee_changed',
    'title_changed',
    'description_edited',
    'parent_set',
    'sub_issue_added',
    'sub_issue_removed',
    'linked',
    'unlinked',
    'due_changed',
    'labels_changed',
] as const satisfies readonly IssueEventKind[];

export const issueEventSchema = z
    .object({
        actor: issueActorSchema.nullable(),
        change: issueChangeSchema,
        createdAt: timestampSchema,
        id: idSchema,
    })
    .strict();

export type IssueEvent = z.infer<typeof issueEventSchema>;

export const issuePullRequestSchema = z
    .object({
        number: z.number().int().positive(),
        repository: z.string().min(3),
        state: z.enum(workerPullRequestStates).nullable(),
        taskId: idSchema,
    })
    .strict();

export type IssuePullRequest = z.infer<typeof issuePullRequestSchema>;

export const issueDetailSchema = z
    .object({
        comments: z.array(issueCommentSchema),
        events: z.array(issueEventSchema),
        issue: issueSchema,
        pullRequests: z.array(issuePullRequestSchema),
        subIssues: z.array(issueSchema),
        subscribed: z.boolean(),
    })
    .strict();

export type IssueDetail = z.infer<typeof issueDetailSchema>;

export const issueCommentResultSchema = z.object({ comment: issueCommentSchema }).strict();

export type IssueCommentResult = z.infer<typeof issueCommentResultSchema>;

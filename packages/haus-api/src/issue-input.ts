import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { issueCommentBodySchema } from './issue-timeline.ts';
import {
    issueActorSchema,
    issueAssigneeSchema,
    issueCodeSchema,
    issueDescriptionSchema,
    issueDueOnSchema,
    issueLabelIdsSchema,
    issuePrioritySchema,
    issueStateSchema,
    issueTitleSchema,
} from './issue.ts';

const expectedVersionSchema = z.number().int().positive();

export const issueListInputSchema = z
    .object({
        assignee: z.union([issueActorSchema, z.literal('none')]).optional(),
        creator: issueActorSchema.optional(),
        parentId: idSchema.optional(),
        projectId: idSchema.optional(),
        query: z.string().trim().min(1).max(200).optional(),
        serverId: idSchema,
        states: z.array(issueStateSchema).min(1).optional(),
    })
    .strict();

export const issueGetInputSchema = z.union([
    z.object({ issueId: idSchema, serverId: idSchema }).strict(),
    z.object({ code: issueCodeSchema, serverId: idSchema }).strict(),
]);

const issueFieldsInput = {
    assignee: issueAssigneeSchema.nullable().optional(),
    description: issueDescriptionSchema.optional(),
    dueOn: issueDueOnSchema.nullable().optional(),
    labelIds: issueLabelIdsSchema.optional(),
    parentId: idSchema.nullable().optional(),
    priority: issuePrioritySchema.optional(),
    state: issueStateSchema.optional(),
};

export const issueCreateInputSchema = z
    .object({
        ...issueFieldsInput,
        projectId: idSchema,
        serverId: idSchema,
        title: issueTitleSchema,
    })
    .strict();

export const issuePatchSchema = z
    .object({ ...issueFieldsInput, title: issueTitleSchema.optional() })
    .strict()
    .refine((patch) => Object.keys(patch).length > 0, 'Provide at least one Issue field.');

export const issueUpdateInputSchema = z
    .object({
        expectAssignee: issueAssigneeSchema.nullable().optional(),
        expectedVersion: expectedVersionSchema,
        issueId: idSchema,
        patch: issuePatchSchema,
        serverId: idSchema,
    })
    .strict();

export const issueCommentInputSchema = z
    .object({
        body: issueCommentBodySchema,
        issueId: idSchema,
        replyToCommentId: idSchema.optional(),
        serverId: idSchema,
    })
    .strict();

export const issueEditCommentInputSchema = z
    .object({ body: issueCommentBodySchema, commentId: idSchema, serverId: idSchema })
    .strict();

export const issueTaskLinkInputSchema = z
    .object({
        expectedVersion: expectedVersionSchema,
        issueId: idSchema,
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

export const issueSetSubscriptionInputSchema = z
    .object({ issueId: idSchema, serverId: idSchema, subscribed: z.boolean() })
    .strict();

export const issueSubscriptionReceiptSchema = issueSetSubscriptionInputSchema;

export type IssueListInput = z.infer<typeof issueListInputSchema>;
export type IssueGetInput = z.infer<typeof issueGetInputSchema>;
export type IssueCreateInput = z.infer<typeof issueCreateInputSchema>;
export type IssuePatch = z.infer<typeof issuePatchSchema>;
export type IssueUpdateInput = z.infer<typeof issueUpdateInputSchema>;
export type IssueCommentInput = z.infer<typeof issueCommentInputSchema>;
export type IssueEditCommentInput = z.infer<typeof issueEditCommentInputSchema>;
export type IssueTaskLinkInput = z.infer<typeof issueTaskLinkInputSchema>;
export type IssueSetSubscriptionInput = z.infer<typeof issueSetSubscriptionInputSchema>;

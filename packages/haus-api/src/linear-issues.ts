import * as z from 'zod';
import { linearObjectIdSchema } from './linear.ts';

// Linear issue references in chat (specs/linear-app.md#issue-references-in-chat):
// what `linear.issue` answers for one issue URL.

const idSchema = z.string().trim().min(1);
const timestampSchema = z.iso.datetime({ offset: true });
const linearColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/u);

export const linearIssueInputSchema = z.object({ serverId: idSchema, url: z.url() }).strict();

/** One issue as a chip and its hovercard show it. */
export const linearIssueViewSchema = z
    .object({
        assignee: z.object({ id: linearObjectIdSchema, name: z.string().min(1) }).nullable(),
        /** The Agent named by the issue's Haus `Agent` label. */
        delegateAgentId: idSchema.nullable(),
        id: linearObjectIdSchema,
        identifier: z.string().min(1),
        labels: z.array(
            z
                .object({ color: linearColorSchema, id: linearObjectIdSchema, name: z.string() })
                .strict()
        ),
        /** The latest ledger-attributed Agent change. */
        lastAgentChange: z
            .object({ agentId: idSchema, changedAt: timestampSchema, summary: z.string().min(1) })
            .strict()
            .nullable(),
        state: z
            .object({ color: linearColorSchema, id: linearObjectIdSchema, name: z.string() })
            .strict(),
        /** A signed, short-lived Server thumbnail URL. */
        thumbnailUrl: z.url().nullable(),
        title: z.string(),
        url: z.url(),
    })
    .strict();
export type LinearIssueView = z.infer<typeof linearIssueViewSchema>;

export const linearIssueUnavailableReasonSchema = z.enum([
    'workspace_not_connected',
    'workspace_unavailable',
    'issue_not_found',
]);
export type LinearIssueUnavailableReason = z.infer<typeof linearIssueUnavailableReasonSchema>;

export const linearIssueResultSchema = z.discriminatedUnion('status', [
    z.object({ issue: linearIssueViewSchema, status: z.literal('available') }).strict(),
    z
        .object({ reason: linearIssueUnavailableReasonSchema, status: z.literal('unavailable') })
        .strict(),
]);
export type LinearIssueResult = z.infer<typeof linearIssueResultSchema>;

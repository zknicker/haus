import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import {
    issueCodeSchema,
    issuePrioritySchema,
    issueStateSchema,
    issueTitleSchema,
} from './issue.ts';

/** Most Issue items one run or busy notice names; a larger batch drains in further runs. */
export const agentIssueWakeBatchLimit = 50;

/** Longest comment excerpt an `issue_event` carries; `haus issue show` prints the whole thread. */
export const agentIssueCommentExcerptMaxChars = 2000;

/**
 * Who made the change: `@handle` for a person or Captain, `task:<shortId>` for a Task, null
 * for the Server (an archive hand-back) or a member with no handle. `byAgent` marks
 * agent-authored work, which spends the automation chain; a person's change resets it.
 */
const issueWakeAuthorFields = {
    by: z.string().min(1).max(128).nullable(),
    byAgent: z.boolean(),
    code: issueCodeSchema,
    id: idSchema,
    issueId: idSchema,
    title: issueTitleSchema,
};

/**
 * One Issue assigned to the agent, or moved out of Backlog while assigned to it, as it stood
 * then (specs/issues.md). `id` is its inbox identity (`issue-assign:<issueId>:<version>`).
 */
export const agentIssueAssignmentSchema = z
    .object({
        ...issueWakeAuthorFields,
        priority: issuePrioritySchema,
        state: issueStateSchema,
    })
    .strict();

export type AgentIssueAssignment = z.infer<typeof agentIssueAssignmentSchema>;

export const agentIssueEventChangeSchema = z.discriminatedUnion('kind', [
    z
        .object({
            body: z.string().min(1).max(agentIssueCommentExcerptMaxChars),
            commentId: idSchema,
            kind: z.literal('commented'),
            truncated: z.boolean(),
        })
        .strict(),
    z
        .object({
            from: issueStateSchema,
            kind: z.literal('state_changed'),
            to: issueStateSchema,
        })
        .strict(),
    z.object({ kind: z.literal('sub_issues_closed'), total: z.number().int().positive() }).strict(),
]);

export type AgentIssueEventChange = z.infer<typeof agentIssueEventChangeSchema>;

/**
 * One change on an Issue whose derived agent this is: a comment, a state change, or its last
 * open sub-issue closing. `id` is its inbox identity (`issue-event:<issueId>:<timelineEventId>`).
 */
export const agentIssueEventSchema = z
    .object({ ...issueWakeAuthorFields, change: agentIssueEventChangeSchema })
    .strict();

export type AgentIssueEvent = z.infer<typeof agentIssueEventSchema>;

export const agentIssueAssignmentsSchema = z
    .array(agentIssueAssignmentSchema)
    .min(1)
    .max(agentIssueWakeBatchLimit);

export const agentIssueEventsSchema = z
    .array(agentIssueEventSchema)
    .min(1)
    .max(agentIssueWakeBatchLimit);

/**
 * Queued Issue items as a busy notice counts them, content-free: `ids` are the identities the
 * notice acknowledges, `total` everything queued, past the ids a notice can carry.
 */
export const agentIssueWakeNoticeSchema = z
    .object({
        ids: z.array(idSchema).min(1).max(agentIssueWakeBatchLimit),
        total: z.number().int().positive(),
    })
    .strict();

export type AgentIssueWakeNotice = z.infer<typeof agentIssueWakeNoticeSchema>;

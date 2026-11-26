import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { type IssueActor, issueActorSchema, sameIssueActor } from './issue.ts';

/**
 * Who an Issue assignment notifies (specs/issues.md#assignee-and-wakes): only a person, and only
 * about work someone else handed them. An agent hears through its inbox, and assigning yourself
 * tells you nothing new.
 */
export function issueAssignmentNotifiedUserId(facts: {
    actor: IssueActor | null;
    assignee: IssueActor | null;
}) {
    const { actor, assignee } = facts;
    if (assignee?.kind !== 'user' || sameIssueActor(actor, assignee)) {
        return null;
    }
    return assignee.userId;
}

/** Who a comment notifies: every subscriber but its author. */
export function issueCommentNotifiedUserIds(facts: {
    author: IssueActor;
    subscriberUserIds: readonly string[];
}) {
    const { author } = facts;
    return facts.subscriberUserIds.filter(
        (userId) => !(author.kind === 'user' && author.userId === userId)
    );
}

/** The one line an Issue push opens with: "Ada assigned you GEN-12". */
export function issueNotificationTitle(input: {
    actorName: string | null;
    code: string;
    kind: IssueNotificationKind;
}) {
    const actor = input.actorName ?? 'Haus';
    return input.kind === 'assigned'
        ? `${actor} assigned you ${input.code}`
        : `${actor} commented on ${input.code}`;
}

export const issueNotificationKinds = ['assigned', 'commented'] as const;

export type IssueNotificationKind = (typeof issueNotificationKinds)[number];

/**
 * `issue.notified`: an Issue change notifies one person. A Server-internal fact, published
 * after the write commits for iPhone push to act on; no client subscribes to it. `actor` is
 * null for the Server (an archive hand-back). `commentId` is set exactly for a comment.
 */
export const issueNotifiedEventSchema = z
    .object({
        actor: issueActorSchema.nullable(),
        commentId: idSchema.nullable(),
        issueId: idSchema,
        kind: z.enum(issueNotificationKinds),
        serverId: idSchema,
        userId: idSchema,
        version: z.number().int().positive(),
    })
    .strict()
    .refine((event) => (event.kind === 'commented') === (event.commentId !== null), {
        message: 'A comment notification names its comment, and only it does.',
        path: ['commentId'],
    });

export type IssueNotifiedEvent = z.infer<typeof issueNotifiedEventSchema>;

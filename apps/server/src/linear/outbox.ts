import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { type LinearOutboxKind, linearOutboxTable } from '../postgres/schema.ts';

// The Linear outbox (specs/linear-app.md#linear-outbox): every Linear write the
// Server decides on its own is a row, enqueued in the transaction that decided
// it, and run by the outbox worker with retries. Inputs are validated again
// when the worker reads them back.

const linearId = z.string().min(1).max(200);
const externalUrlSchema = z.object({ label: z.string().min(1), url: z.url() }).strict();

/** Each kind's input, keyed by kind. */
export const linearOutboxInputSchemas = {
    /**
     * A removed identity's open delegated issues go back to the Haus app. The
     * worker lists them with the workspace token, since a removal transaction
     * cannot read Linear.
     */
    identity_hand_back: z
        .object({
            /** The Haus app's Linear user in this workspace: the new delegate. */
            delegateId: linearId,
            /** The removed identity's Linear app user. */
            identityUserId: linearId,
        })
        .strict(),
    issue_route: z
        .object({
            /** The Linear user the issue is delegated to; null leaves the delegate alone. */
            delegateId: linearId.nullable(),
            issueId: linearId,
            /** The Agent label to set; the group is single-select, so it replaces the old one. */
            labelId: linearId.nullable(),
            /** Agent labels Haus owns that must come off (the previous Agent's). */
            removeLabelIds: z.array(linearId),
        })
        .strict(),
    label_archive: z.object({ labelId: linearId }).strict(),
    label_create: z
        .object({ agentLabelRowId: z.string().min(1), name: z.string().min(1), teamId: linearId })
        .strict(),
    label_group_create: z.object({ name: z.string().min(1), teamId: linearId }).strict(),
    label_rename: z.object({ labelId: linearId, name: z.string().min(1) }).strict(),
    session_ack: z
        .object({
            body: z.string().min(1),
            externalUrls: z.array(externalUrlSchema),
            linearSessionId: linearId,
            sessionRowId: z.string().min(1),
        })
        .strict(),
    session_activity: z
        .object({
            body: z.string().min(1),
            linearSessionId: linearId,
            type: z.enum(['error', 'elicitation']),
        })
        .strict(),
    session_create: z
        .object({ externalUrls: z.array(externalUrlSchema), issueId: linearId })
        .strict(),
    /** Written by the binding slice (`revokeLinearCredentials`); null client id is the Haus app's. */
    token_revoke: z
        .object({ clientId: z.string().min(1).nullable(), token: z.string().min(1) })
        .strict(),
} as const satisfies Record<LinearOutboxKind, z.ZodType>;

export type LinearOutboxInput<Kind extends LinearOutboxKind> = z.infer<
    (typeof linearOutboxInputSchemas)[Kind]
>;

/** Kinds whose call creates a Linear object under a client-supplied id. */
const creatingKinds: ReadonlySet<LinearOutboxKind> = new Set([
    'session_ack',
    'session_activity',
    'label_group_create',
    'label_create',
]);

export interface LinearOutboxEntry<Kind extends LinearOutboxKind> {
    /** The actor that makes the call; null only for `token_revoke`, which carries its token. */
    credentialId: string | null;
    input: LinearOutboxInput<Kind>;
    kind: Kind;
    serverId: string;
    workspaceId: string;
}

/**
 * Enqueues one Linear call inside the caller's transaction. A call that
 * creates something gets its client id now, so every retry sends the same id
 * and Linear's "already exists" proves the first attempt landed.
 */
export async function enqueueLinearOutbox<Kind extends LinearOutboxKind>(
    tx: HausDatabase,
    entry: LinearOutboxEntry<Kind>,
    now: Date
): Promise<string> {
    const id = createOpaqueId('lnx');
    const input = linearOutboxInputSchemas[entry.kind].parse(entry.input);
    await tx.insert(linearOutboxTable).values({
        clientId: creatingKinds.has(entry.kind) ? randomUUID() : null,
        createdAt: now,
        credentialId: entry.credentialId,
        id,
        input: input as Record<string, unknown>,
        kind: entry.kind,
        nextAttemptAt: now,
        serverId: entry.serverId,
        state: 'queued',
        workspaceId: entry.workspaceId,
    });
    return id;
}

/** The `externalUrls` every session carries: a link to its anchor DM in Haus. */
export function linearSessionExternalUrls(input: {
    appOrigin: string;
    chatId: string;
    serverSlug: string;
}): { label: string; url: string }[] {
    const path = `/s/${input.serverSlug}/chats/${encodeURIComponent(input.chatId)}`;
    const url = new URL(path, input.appOrigin);
    return [{ label: 'Open in Haus', url: url.toString() }];
}

import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, linearAgentSessionsTable } from '../postgres/schema.ts';
import { workspaceCredentialId } from './agent-label-reads.ts';
import { readActorCredential } from './credentials.ts';
import { enqueueLinearOutbox, linearSessionExternalUrls } from './outbox.ts';
import type { SessionWorkspace } from './session-agents.ts';
import type { LinearSessionRecord } from './sessions.ts';

// What the delivery worker posts back into a Linear session through the
// outbox: the acknowledgment, and error or elicitation activities.

export const noAgentElicitation =
    'No Agent is assigned. Add an Agent label or mention @haus with an Agent’s name.';
export const unavailableAgentError = 'This Agent is no longer available in Haus';
export const stoppedSessionElicitation =
    'This session was stopped. Mention @haus or delegate the issue to start a new one.';

/** "Juniper is on it" plus a link to the anchor DM, sent by the session's own actor. */
export async function acknowledgeLinearSession(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    input: {
        agentName: string;
        appOrigin: string;
        chatId: string;
        identityId: string | null;
        linearSessionId: string;
        now: Date;
        sessionRowId: string;
    }
) {
    const credentialId = await sessionCredential(tx, workspace, input.identityId);
    if (!credentialId) {
        return;
    }
    await enqueueLinearOutbox(
        tx,
        {
            credentialId,
            input: {
                body: `${input.agentName} is on it`,
                externalUrls: linearSessionExternalUrls({
                    appOrigin: input.appOrigin,
                    chatId: input.chatId,
                    serverSlug: workspace.slug,
                }),
                linearSessionId: input.linearSessionId,
                sessionRowId: input.sessionRowId,
            },
            kind: 'session_ack',
            serverId: workspace.serverId,
            workspaceId: workspace.id,
        },
        input.now
    );
}

/** An activity from the actor that received the session; nothing when none can post. */
export async function postLinearSessionActivity(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    input: {
        body: string;
        identityId: string | null;
        linearSessionId: string;
        now: Date;
        type: 'error' | 'elicitation';
    }
) {
    const credentialId = await sessionCredential(tx, workspace, input.identityId);
    if (!credentialId) {
        return;
    }
    await enqueueLinearOutbox(
        tx,
        {
            credentialId,
            input: { body: input.body, linearSessionId: input.linearSessionId, type: input.type },
            kind: 'session_activity',
            serverId: workspace.serverId,
            workspaceId: workspace.id,
        },
        input.now
    );
}

/** Why a prompt to a closed session gets no turn, naming the new owner after a handoff. */
export async function closedSessionNotice(
    tx: HausDatabase,
    session: LinearSessionRecord
): Promise<{ body: string; type: 'error' | 'elicitation' } | null> {
    if (session.status === 'orphaned') {
        return { body: unavailableAgentError, type: 'error' };
    }
    if (session.status === 'stopped') {
        return { body: stoppedSessionElicitation, type: 'elicitation' };
    }
    if (session.status !== 'handed_off') {
        return null;
    }
    const owner = await currentIssueOwner(tx, session);
    return {
        body: owner
            ? `This issue was handed off to ${owner}. Mention @haus or delegate the issue to ${owner} to continue.`
            : 'This issue was handed off to another Agent. Mention @haus or delegate the issue to continue.',
        type: 'elicitation',
    };
}

/** The Agent of the newest open session on the same issue, other than this one's. */
async function currentIssueOwner(
    tx: HausDatabase,
    session: LinearSessionRecord
): Promise<string | null> {
    const [owner] = await tx
        .select({ displayName: agentsTable.displayName })
        .from(linearAgentSessionsTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, linearAgentSessionsTable.serverId),
                eq(agentsTable.id, linearAgentSessionsTable.agentId)
            )
        )
        .where(
            and(
                eq(linearAgentSessionsTable.workspaceId, session.workspaceId),
                eq(linearAgentSessionsTable.issueId, session.issueId),
                inArray(linearAgentSessionsTable.status, ['active', 'complete']),
                ne(linearAgentSessionsTable.id, session.id)
            )
        )
        .orderBy(desc(linearAgentSessionsTable.lastEventAt))
        .limit(1);
    return owner?.displayName ?? null;
}

/** Session activities never fall back: an identity session posts as the identity or not at all. */
async function sessionCredential(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    identityId: string | null
): Promise<string | null> {
    if (!identityId) {
        return await workspaceCredentialId(tx, workspace.id);
    }
    const credential = await readActorCredential(tx, { identityId, workspaceId: workspace.id });
    return credential?.state === 'valid' ? credential.id : null;
}

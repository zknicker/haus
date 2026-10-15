import type { HausDatabase } from '../postgres/connection.ts';
import { workspaceCredentialId } from './agent-label-reads.ts';
import { readActorCredential } from './credentials.ts';
import type {
    LinearDeliveryHandler,
    LinearDeliveryOutcome,
    LinearDeliveryRow,
} from './delivery-handler.ts';
import { type LinearSessionEventFacts, readSessionEvent } from './delivery-payload.ts';
import { correlateLinearDelivery } from './loop-safety.ts';
import { enqueueLinearOutbox, linearSessionExternalUrls } from './outbox.ts';
import {
    readSessionAgent,
    readSessionIdentity,
    readSessionWorkspace,
    routeHausAppSession,
    type SessionWorkspace,
} from './session-agents.ts';
import { anchorLinearSession } from './session-anchor.ts';
import { linearSessionEnvelope } from './session-envelope.ts';
import { enqueueLinearSessionItem } from './session-inbox.ts';
import { createLinearSession, findLinearSession, touchLinearSession } from './sessions.ts';

export const noAgentElicitation =
    'No Agent is assigned. Add an Agent label or mention @haus with an Agent’s name.';
export const unavailableAgentError = 'This Agent is no longer available in Haus';

/**
 * Routes one `AgentSessionEvent` (specs/linear-app.md#linear-sessions): picks
 * the Agent, anchors the session on its DM with the binder, acknowledges a new
 * session through the outbox before any Agent turn, and queues the envelope
 * as a `linear_session` or `linear_session_automated` inbox row.
 */
export function linearSessionHandler(input: { appOrigin: string }): LinearDeliveryHandler {
    return {
        apply: (tx, row, now) => routeSessionEvent(tx, row, now, input.appOrigin),
    };
}

async function routeSessionEvent(
    tx: HausDatabase,
    row: LinearDeliveryRow,
    now: Date,
    appOrigin: string
): Promise<LinearDeliveryOutcome> {
    const facts = readSessionEvent(row.body);
    const workspace = await readSessionWorkspace(tx, row.workspaceId);
    // Q9: until Linear's stop signal is captured, any other action stays unsupported.
    if (!(facts && workspace && (facts.action === 'created' || facts.action === 'prompted'))) {
        return { kind: 'ignored', reason: 'unsupported_event' };
    }
    const cause = await correlateLinearDelivery(tx, {
        actorId: facts.causedBy,
        changedAt: row.webhookTimestamp,
        deferredSince: row.deferredSince,
        entityId: facts.issue.id,
        now,
        workspaceId: workspace.id,
    });
    if (cause.kind === 'defer') {
        return cause;
    }
    const identityId = row.receiver === 'app' ? null : row.receiver;
    const existing = await findLinearSession(tx, {
        linearSessionId: facts.linearSessionId,
        workspaceId: workspace.id,
    });
    const post = (type: 'error' | 'elicitation', body: string) =>
        postActivity(tx, workspace, {
            body,
            identityId,
            linearSessionId: facts.linearSessionId,
            now,
            type,
        });
    if (existing?.status === 'orphaned') {
        await post('error', unavailableAgentError);
        return done(0);
    }
    const routed = await chooseAgent(tx, workspace, identityId, facts);
    if (routed.kind === 'none') {
        await post('elicitation', noAgentElicitation);
        return done(0);
    }
    if (routed.kind === 'unavailable') {
        await post('error', `${unavailableAgentError}: ${routed.reason}.`);
        return done(0);
    }
    const { agent } = routed;
    const anchor = await anchorLinearSession(tx, {
        agentId: agent.id,
        serverId: workspace.serverId,
        workspaceId: workspace.id,
    });
    if (!anchor) {
        await post('error', `${unavailableAgentError}: no one in Haus can receive it.`);
        return done(0);
    }
    const session = existing
        ? await touchLinearSession(tx, existing, {
              agentId: agent.id,
              anchorChatId: anchor.chatId,
              now,
              reopen: facts.action === 'prompted',
          })
        : await createLinearSession(tx, {
              agentId: agent.id,
              anchorChatId: anchor.chatId,
              identityId,
              issueId: facts.issue.id,
              issueIdentifier: facts.issue.identifier,
              linearSessionId: facts.linearSessionId,
              now,
              serverId: workspace.serverId,
              workspaceId: workspace.id,
          });
    if (!existing) {
        await acknowledge(tx, workspace, {
            agentName: agent.displayName,
            appOrigin,
            chatId: anchor.chatId,
            identityId,
            linearSessionId: facts.linearSessionId,
            now,
            sessionRowId: session.id,
        });
    }
    await enqueueLinearSessionItem(tx, {
        agentId: agent.id,
        automated: cause.kind === 'agent',
        chatId: anchor.chatId,
        content: linearSessionEnvelope({
            agentName: agent.displayName,
            event: facts.action,
            guidance: facts.guidance,
            issue: facts.issue,
            origin:
                facts.action === 'prompted'
                    ? 'prompted'
                    : facts.mentioned
                      ? 'mentioned'
                      : 'delegated',
            prompt: facts.prompt,
            promptContext: facts.promptContext,
            sessionId: session.id,
        }),
        createdAt: now,
        deliveryId: row.deliveryId,
        serverId: workspace.serverId,
        sessionId: session.id,
    });
    return {
        announce: anchor.announce ? [anchor.announce] : [],
        kind: 'done',
        routed: 1,
        wakes: [{ agentId: agent.id, serverId: workspace.serverId }],
    };
}

type RoutedAgent =
    | { agent: { displayName: string; id: string }; kind: 'agent' }
    | { kind: 'none' }
    | { kind: 'unavailable'; reason: string };

/** Identity sessions always belong to the identity's Agent; Haus app sessions route per event. */
async function chooseAgent(
    tx: HausDatabase,
    workspace: SessionWorkspace,
    identityId: string | null,
    facts: LinearSessionEventFacts
): Promise<RoutedAgent> {
    const identity = identityId ? await readSessionIdentity(tx, identityId) : null;
    if (identityId && !identity) {
        return { kind: 'unavailable', reason: 'its Linear identity was removed' };
    }
    const agentId =
        identity?.agentId ??
        (await routeHausAppSession(tx, workspace, {
            labelIds: facts.issue.labelIds,
            prompt: facts.prompt,
        }));
    if (!agentId) {
        return { kind: 'none' };
    }
    const agent = await readSessionAgent(tx, workspace, agentId);
    if (!agent || agent.retired) {
        return { kind: 'unavailable', reason: 'the Agent was retired' };
    }
    if (!agent.granted) {
        return { kind: 'unavailable', reason: 'the Agent no longer has access to Linear' };
    }
    if (identity && identity.status !== 'active') {
        return { kind: 'unavailable', reason: 'its Linear identity is not active' };
    }
    return { agent, kind: 'agent' };
}

/** "Juniper is on it" plus a link to the anchor DM, sent by the session's own actor. */
async function acknowledge(
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
async function postActivity(
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

function done(routed: number): LinearDeliveryOutcome {
    return { announce: [], kind: 'done', routed, wakes: [] };
}

import type { HausDatabase } from '../postgres/connection.ts';
import type {
    LinearDeliveryHandler,
    LinearDeliveryOutcome,
    LinearDeliveryRow,
} from './delivery-handler.ts';
import { type LinearSessionEventFacts, readSessionEvent } from './delivery-payload.ts';
import { correlateLinearDelivery } from './loop-safety.ts';
import {
    acknowledgeLinearSession,
    closedSessionNotice,
    noAgentElicitation,
    postLinearSessionActivity,
    unavailableAgentError,
} from './session-activities.ts';
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
import type { PreparedSessionLabels, ReadSessionIssueLabels } from './session-issue-labels.ts';
import {
    closeLinearSessions,
    createLinearSession,
    findLinearSession,
    touchLinearSession,
} from './sessions.ts';

/**
 * Routes one `AgentSessionEvent` (specs/linear-app.md#linear-sessions): picks
 * the Agent, anchors the session on its DM with the binder, acknowledges a new
 * session through the outbox before any Agent turn, and queues the envelope
 * as a `linear_session` or `linear_session_automated` inbox row. A stop signal
 * closes the session `stopped` instead (Q9).
 */
export function linearSessionHandler(input: {
    appOrigin: string;
    readIssueLabels: ReadSessionIssueLabels;
}): LinearDeliveryHandler<PreparedSessionLabels> {
    return {
        apply: (tx, row, now, prepared) =>
            routeSessionEvent(tx, row, now, {
                appOrigin: input.appOrigin,
                labelIds: prepared?.labelIds ?? null,
            }),
        prepare: input.readIssueLabels,
    };
}

async function routeSessionEvent(
    tx: HausDatabase,
    row: LinearDeliveryRow,
    now: Date,
    context: { appOrigin: string; labelIds: string[] | null }
): Promise<LinearDeliveryOutcome> {
    const facts = readSessionEvent(row.body);
    const workspace = await readSessionWorkspace(tx, row.workspaceId);
    if (!(facts && workspace && (facts.action === 'created' || facts.action === 'prompted'))) {
        return { kind: 'ignored', reason: 'unsupported_event' };
    }
    const existing = await findLinearSession(tx, {
        linearSessionId: facts.linearSessionId,
        workspaceId: workspace.id,
    });
    if (facts.signal === 'stop') {
        if (existing) {
            await closeLinearSessions(tx, {
                now,
                serverId: workspace.serverId,
                status: 'stopped',
                where: { sessionIds: [existing.id] },
            });
        }
        return done(0);
    }
    const cause = await correlateLinearDelivery(tx, {
        actorId: facts.causedBy,
        changedAt: row.webhookTimestamp,
        created: false,
        deferredSince: row.deferredSince,
        entityId: facts.issue.id,
        now,
        workspaceId: workspace.id,
    });
    if (cause.kind === 'defer') {
        return cause;
    }
    const identityId = row.receiver === 'app' ? null : row.receiver;
    const post = (type: 'error' | 'elicitation', body: string) =>
        postLinearSessionActivity(tx, workspace, {
            body,
            identityId,
            linearSessionId: facts.linearSessionId,
            now,
            type,
        });
    const closed = existing ? await closedSessionNotice(tx, existing) : null;
    if (closed) {
        await post(closed.type, closed.body);
        return done(0);
    }
    const routed = await chooseAgent(tx, workspace, identityId, facts, context.labelIds);
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
        await acknowledgeLinearSession(tx, workspace, {
            agentName: agent.displayName,
            appOrigin: context.appOrigin,
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
    facts: LinearSessionEventFacts,
    labelIds: string[] | null
): Promise<RoutedAgent> {
    const identity = identityId ? await readSessionIdentity(tx, identityId) : null;
    if (identityId && !identity) {
        return { kind: 'unavailable', reason: 'its Linear identity was removed' };
    }
    const agentId =
        identity?.agentId ??
        (await routeHausAppSession(tx, workspace, {
            labelIds,
            labelNames: facts.issueLabelNames,
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

function done(routed: number): LinearDeliveryOutcome {
    return { announce: [], kind: 'done', routed, wakes: [] };
}

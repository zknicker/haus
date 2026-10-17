import { type LinearCallMeta, linearMetaKey, uuidV5 } from '@haus/api/linear-actor-meta';
import type { HausDatabase } from '../postgres/connection.ts';
import type {
    McpToolCall,
    McpToolCallTransport,
    McpToolResult,
} from '../server-mcp/tool-catalog.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { chooseLinearActor, loadActorContext } from './actor-selection.ts';
import { liveWorkspace } from './authority.ts';
import { resolveDelegation } from './delegation.ts';
import type { LinearActor } from './linear-actor.ts';
import type { LinearApp } from './linear-api.ts';
import { LinearSignInRequiredError } from './linear-errors.ts';
import { completeLinearSession } from './sessions.ts';
import { type LinearTeamCache, linearToolAccess } from './target-teams.ts';
import type { LinearTokenRefresher } from './token-refresh.ts';
import {
    type LinearToolRefusal,
    linearFailure,
    redactError,
    redactResult,
    refusalResult,
    tokenRejected,
    toolError,
} from './tool-results.ts';

// Per-request actor transport (specs/linear-app.md#per-request-actor-transport).
// The connector is a stateless executor; before each `tools/call` the Server
// chooses the actor, keeps its token valid past the deadline, and sends it in
// request `_meta`. `_meta` is a credential: it never appears in what this
// answers, throws, or logs.

/** One call as the ledger sees it (specs/linear-app.md#write-ledger). */
export interface LinearWriteCall {
    actor: LinearActor;
    agentId: string;
    arguments: Record<string, unknown>;
    idSeed: string;
    requestId: string;
    serverId: string;
    tool: string;
    workspaceId: string;
}

/** The write ledger and media hooks around one write or session reply. */
export interface LinearWriteHooks {
    /**
     * Before the call. A recorded result is the answer (idempotent replay);
     * `meta` adds the tool-specific `_meta` parts (`delegation`, `upload`).
     */
    begin(input: LinearWriteCall): Promise<{
        meta?: Record<string, unknown>;
        recorded?: unknown;
    }>;
    /** After the call, with the connector's result `_meta` (its mutations). */
    complete(
        input: LinearWriteCall & { result: McpToolResult; resultMeta: unknown }
    ): Promise<void>;
}

export interface LinearToolTransportDependencies {
    app: LinearApp | null;
    /** Mints the signed avatar URL for `displayIconUrl`; absent until signed URLs are configured. */
    avatarUrl?: (agentId: string) => string | null;
    cache: LinearTeamCache;
    clock: { now(): Date };
    db: HausDatabase;
    hooks?: LinearWriteHooks;
    /** Null without a configured Haus app: every call answers `linear_sign_in_required`. */
    refresher: LinearTokenRefresher | null;
}

/** Tokens are refreshed when they would expire within ten minutes. */
const tokenValidForMs = 10 * 60_000;
const idSeedNamespace = 'b1a5f1d0-6c43-4b8e-9d2a-8a1f3c5e7d90';

type SendMeta = (meta: LinearCallMeta) => Promise<McpToolResult>;

export class LinearToolTransport implements McpToolCallTransport {
    constructor(private readonly dependencies: LinearToolTransportDependencies) {}

    async call(
        call: McpToolCall,
        send: (meta: Record<string, unknown>) => Promise<McpToolResult>
    ): Promise<unknown> {
        const tokens = new Set<string>();
        try {
            const result = await this.run(call, async (meta) => {
                tokens.add(meta.accessToken);
                return await send({ [linearMetaKey]: meta });
            });
            return redactResult(result, tokens);
        } catch (cause) {
            throw redactError(cause, tokens);
        }
    }

    private async run(call: McpToolCall, send: SendMeta): Promise<unknown> {
        const { app, db, refresher } = this.dependencies;
        const { requestId } = call;
        if (!requestId) {
            throw new Error('A Linear tool call needs its MCP request id.');
        }
        const access = linearToolAccess[call.toolName];
        if (!access) {
            return toolError('linear_input_error', `Haus has no Linear tool ${call.toolName}.`);
        }
        const workspace = await liveWorkspace(db, call);
        const context =
            app && workspace?.status === 'active'
                ? await loadActorContext(db, {
                      agentId: call.agentId,
                      now: this.dependencies.clock.now(),
                      serverId: call.serverId,
                      workspaceAppUserId: workspace.appUserId,
                      workspaceId: workspace.id,
                  })
                : null;
        if (!(app && refresher && workspace && context)) {
            return refusalResult({ refused: 'linear_sign_in_required' });
        }
        try {
            const choice = await chooseLinearActor(
                db,
                {
                    cache: this.dependencies.cache,
                    transport: app.fetch,
                    workspaceToken: async () =>
                        (await refresher.fresh(context.workspace.credentialId, tokenValidForMs))
                            .accessToken,
                },
                {
                    access,
                    agentId: call.agentId,
                    args: call.arguments,
                    context,
                    workspaceId: workspace.id,
                }
            );
            if ('refused' in choice) {
                return refusalResult(choice);
            }
            const delegated: Pick<LinearCallMeta, 'delegation'> | LinearToolRefusal =
                call.toolName === 'delegate_issue'
                    ? await resolveDelegation(db, {
                          connectionId: call.connectionId,
                          issueTeamId: choice.targetTeams?.[0]?.id ?? null,
                          now: this.dependencies.clock.now(),
                          serverId: call.serverId,
                          target: call.arguments.agent,
                          workspace,
                      })
                    : {};
            if ('refused' in delegated) {
                return refusalResult(delegated);
            }
            const write: LinearWriteCall = {
                actor: choice.actor,
                agentId: call.agentId,
                arguments: call.arguments,
                idSeed: uuidV5(`${workspace.id}:${requestId}`, idSeedNamespace),
                requestId,
                serverId: call.serverId,
                tool: call.toolName,
                workspaceId: workspace.id,
            };
            const hooks =
                access.kind === 'write' || access.kind === 'session'
                    ? this.dependencies.hooks
                    : undefined;
            const extra = { ...delegated, self: choice.self, session: choice.session };
            return await this.send(write, { deadlineMs: call.deadlineMs, extra, hooks }, send);
        } catch (cause) {
            return linearFailure(cause);
        }
    }

    /** Sends with a token valid past the deadline; one Linear `401` forces one refresh and one resend. */
    private async send(
        write: LinearWriteCall,
        options: {
            deadlineMs: number;
            extra: Pick<LinearCallMeta, 'delegation' | 'self' | 'session'>;
            hooks: LinearWriteHooks | undefined;
        },
        send: SendMeta
    ): Promise<unknown> {
        const { deadlineMs, hooks } = options;
        const begun = hooks ? await hooks.begin(write) : {};
        if (begun.recorded !== undefined) {
            return begun.recorded;
        }
        const { actor } = write;
        const displayIconUrl = actor.createAsUser
            ? (this.dependencies.avatarUrl?.(write.agentId) ?? null)
            : null;
        const meta = (accessToken: string): LinearCallMeta => ({
            // Tool-specific parts (`upload`) first: the actor and token always win.
            ...begun.meta,
            ...options.extra,
            accessToken,
            actor: {
                appUserId: actor.appUserId,
                createAsUser: actor.createAsUser,
                displayIconUrl,
                kind: actor.kind,
            },
            deadlineMs,
            idSeed: write.idSeed,
            requestId: write.requestId,
            workspaceId: write.workspaceId,
        });
        const { refresher } = this.dependencies;
        if (!refresher) {
            throw new LinearSignInRequiredError();
        }
        const credential = await refresher.fresh(actor.credentialId, tokenValidForMs);
        let result = await send(meta(credential.accessToken));
        if (tokenRejected(result)) {
            // Same request id and seed: the resend is idempotent.
            const renewed = await refresher.afterRejection(credential.id, credential.generation);
            result = await send(meta(renewed.accessToken));
        }
        await hooks?.complete({ ...write, result, resultMeta: result._meta?.[linearMetaKey] });
        await this.completeSession(write, result);
        return result;
    }

    /** A posted `response` completes the session until a new prompt reopens it. */
    private async completeSession(write: LinearWriteCall, result: McpToolResult) {
        const { session, type } = write.arguments;
        if (
            write.tool !== 'reply' ||
            type !== 'response' ||
            typeof session !== 'string' ||
            result.isError === true
        ) {
            return;
        }
        const now = this.dependencies.clock.now();
        await this.dependencies.db.transaction(async (tx) => {
            await lockServerRow(tx, write.serverId);
            await completeLinearSession(tx, { now, serverId: write.serverId, sessionId: session });
        });
    }
}

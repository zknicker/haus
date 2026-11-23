import { and, eq, ne, sql } from 'drizzle-orm';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubInstallationsTable } from '../postgres/schema.ts';
import type { GithubApp } from './github-app.ts';
import { createInstallationTokens } from './installation-tokens.ts';

const rpcIdSchema = z.union([z.string(), z.number()]);
const toolCallSchema = z.object({
    id: rpcIdSchema,
    method: z.literal('tools/call'),
    params: z.object({
        arguments: z.object({ owner: z.string().min(1).optional() }).optional(),
        name: z.string().min(1),
    }),
});

/** Reads that name no owner, such as search and `get_me`, run as the signed-in person. */
const ownerlessRead = /^(?:get|list|search)_/u;

type McpFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

/** Finds the bound installation for a GitHub account on one connection. */
export type GithubInstallationLookup = (
    connectionId: string,
    owner: string
) => Promise<number | null>;

/** Sends a connection's Agent tool calls as the Haus GitHub App. */
export interface GithubBot {
    fetch(connectionId: string, next: McpFetch): McpFetch;
}

/**
 * An Agent's tool call naming an `owner` runs as the App, so GitHub attributes
 * it to the bot, and is refused when the App is not installed on that owner.
 * It never falls back to the user token: a failed mint fails the call rather
 * than posting under a person's name. The one exception is a read that names
 * no owner (`get_`, `list_`, `search_`), which keeps the connection's user
 * token, as discovery does; any other ownerless call is refused.
 */
export function createGithubBot(
    app: GithubApp,
    findInstallation: GithubInstallationLookup,
    now: () => number = Date.now
): GithubBot {
    const tokens = createInstallationTokens(app, now);
    return {
        fetch: (connectionId, next) => async (url, init) => {
            const call = readToolCall(init?.body);
            if (call === null) {
                return await next(url, init);
            }
            if (call.kind === 'unreadable') {
                return refusal(call.id, 'Haus could not read this GitHub tool call.');
            }
            const { owner } = call;
            if (owner === undefined) {
                return ownerlessRead.test(call.name)
                    ? await next(url, init)
                    : refusal(
                          call.id,
                          `${call.name} names no owner, so it would act as the person who signed in to GitHub. Agents act on GitHub only as the Haus GitHub App: name the repository owner.`
                      );
            }
            const installationId = await findInstallation(connectionId, owner);
            if (installationId === null) {
                return refusal(
                    call.id,
                    `The Haus GitHub App is not installed on ${owner}, so Agents cannot act there. Ask an Owner or Admin to install it on ${owner}.`
                );
            }
            const send = async () => {
                const headers = new Headers(init?.headers);
                headers.set('Authorization', `Bearer ${await tokens.read(installationId)}`);
                return await next(url, { ...init, headers });
            };
            const response = await send();
            if (response.status !== 401) {
                return response;
            }
            tokens.forget(installationId);
            return await send();
        },
    };
}

/** The live installation bound to a connection for a GitHub account, by login. */
export function githubInstallationLookup(db: HausDatabase): GithubInstallationLookup {
    return async (connectionId, owner) => {
        const [row] = await db
            .select({ installationId: githubInstallationsTable.installationId })
            .from(githubInstallationsTable)
            .where(
                and(
                    eq(githubInstallationsTable.connectionId, connectionId),
                    ne(githubInstallationsTable.status, 'removed'),
                    eq(sql`lower(${githubInstallationsTable.accountLogin})`, owner.toLowerCase())
                )
            )
            .limit(1);
        return row?.installationId ?? null;
    };
}

/**
 * A JSON-RPC `tools/call` body's id, tool and `owner` argument; null for any
 * other request, and `unreadable` for a tool call whose arguments do not parse.
 */
function readToolCall(body: RequestInit['body']) {
    const message = typeof body === 'string' ? parseJson(body) : null;
    if (!(isRecord(message) && message.method === 'tools/call')) {
        return null;
    }
    const parsed = toolCallSchema.safeParse(message);
    if (!parsed.success) {
        const id = rpcIdSchema.safeParse(message.id);
        return { id: id.success ? id.data : null, kind: 'unreadable' as const };
    }
    return {
        id: parsed.data.id,
        kind: 'call' as const,
        name: parsed.data.params.name,
        owner: parsed.data.params.arguments?.owner,
    };
}

function parseJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A tool result the Agent reads as a failed call; nothing reaches GitHub. */
function refusal(id: number | string | null, text: string) {
    return Response.json({
        id,
        jsonrpc: '2.0',
        result: { content: [{ text, type: 'text' }], isError: true },
    });
}

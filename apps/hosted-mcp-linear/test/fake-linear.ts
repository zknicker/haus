import { type LinearCallMeta, linearMetaKey } from '@haus/api/linear-actor-meta';
import { linearGraphqlEndpoint } from '../src/linear-graphql.ts';
import { createLinearMcpHandler } from '../src/mcp-http.ts';

// A recorded-response stand-in for Linear: GraphQL operations answer from
// fixtures shaped like Linear's schema, keyed by operation name; other URLs
// (signed upload sources, storage PUTs) answer from URL fixtures.

export const accessToken = 'lin_oauth_fixture_token_never_echoed';

export const workspaceMeta: LinearCallMeta = {
    accessToken,
    actor: {
        appUserId: 'app-user-haus',
        createAsUser: 'Juniper',
        displayIconUrl: 'https://haus.example/api/linear/avatar/agt_x/1/sig',
        kind: 'workspace',
    },
    deadlineMs: 30_000,
    idSeed: '3f0a3d6e-5d0c-5b5e-8f43-0b1b6f1c2a90',
    requestId: 'req-1',
    workspaceId: 'lnw_AAAAAAAAAAAAAAAA',
};

export const identityMeta: LinearCallMeta = {
    ...workspaceMeta,
    // The Server sends explicit nulls when there is no attribution.
    actor: {
        appUserId: 'app-user-juniper',
        createAsUser: null,
        displayIconUrl: null,
        kind: 'identity',
    },
};

export interface RecordedRequest {
    authorization: string | null;
    operation: string;
    query: string;
    variables: Record<string, unknown>;
}

export interface FixtureAnswer {
    body: unknown;
    headers?: Record<string, string>;
    status?: number;
}

type GraphqlFixture = (variables: Record<string, unknown>, attempt: number) => FixtureAnswer;
type UrlFixture = (init: RequestInit | undefined) => Response | Promise<Response>;

export function fakeLinear(
    operations: Record<string, GraphqlFixture>,
    urls: Record<string, UrlFixture> = {}
) {
    const requests: RecordedRequest[] = [];
    const urlRequests: { init: RequestInit | undefined; url: string }[] = [];
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url !== linearGraphqlEndpoint) {
            urlRequests.push({ init, url });
            const fixture = urls[url];
            if (!fixture) {
                throw new Error(`No URL fixture for ${url}`);
            }
            return await fixture(init);
        }
        const body = JSON.parse(String(init?.body)) as {
            query: string;
            variables: Record<string, unknown>;
        };
        const operation = /(?:query|mutation)\s+(\w+)/u.exec(body.query)?.[1] ?? 'anonymous';
        const attempt = requests.filter((request) => request.operation === operation).length;
        requests.push({
            authorization: new Headers(init?.headers).get('Authorization'),
            operation,
            query: body.query,
            variables: body.variables,
        });
        const fixture = operations[operation];
        if (!fixture) {
            throw new Error(`No GraphQL fixture for ${operation}`);
        }
        const answer = fixture(body.variables, attempt);
        return Response.json(answer.body, {
            headers: answer.headers,
            status: answer.status ?? 200,
        });
    }) as typeof globalThis.fetch;
    return { fetch, requests, urlRequests };
}

export function data(payload: Record<string, unknown>): FixtureAnswer {
    return { body: { data: payload } };
}

export function linearError(
    code: string,
    message: string,
    userPresentableMessage = message
): FixtureAnswer {
    return {
        body: {
            data: null,
            errors: [
                {
                    extensions: { code, type: code.toLowerCase(), userPresentableMessage },
                    message,
                },
            ],
        },
        status: 400,
    };
}

export interface ToolCallResult {
    _meta: Record<string, { completed: boolean; mutations: Record<string, unknown>[] }>;
    content: { text: string; type: string }[];
    isError: boolean;
    structuredContent: Record<string, unknown>;
}

/** One `tools/call` through the real JSON-RPC handler. */
export async function callTool(
    linear: { fetch: typeof fetch },
    name: string,
    args: Record<string, unknown>,
    meta: Partial<LinearCallMeta> = {}
) {
    const response = await rpc(linear, 'tools/call', {
        _meta: { [linearMetaKey]: { ...workspaceMeta, ...meta } },
        arguments: args,
        name,
    });
    const text = await response.text();
    const parsed = JSON.parse(text) as { result: ToolCallResult };
    const report = parsed.result._meta[linearMetaKey];
    if (!report) {
        throw new Error('The connector omitted its result _meta.');
    }
    return { raw: text, report, result: parsed.result };
}

export async function rpc(
    linear: { fetch: typeof fetch },
    method: string,
    params?: Record<string, unknown>,
    id: number | null = 1
) {
    return await createLinearMcpHandler({ fetch: linear.fetch })(
        new Request('http://localhost/mcp', {
            body: JSON.stringify({
                ...(id === null ? {} : { id }),
                jsonrpc: '2.0',
                method,
                params,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
        })
    );
}

export const issueNode = {
    assignee: { displayName: 'zach', id: 'user-zach' },
    delegate: null,
    id: '0b6b3a3e-5a43-4c1e-9b6e-3c5f0d0c9a11',
    identifier: 'DES-142',
    labels: { nodes: [{ id: 'label-review', name: 'Needs review' }] },
    priority: 2,
    project: { id: 'project-niche', name: 'Cat dads' },
    state: { id: 'state-review', name: 'Design Review', type: 'started' },
    team: { id: 'team-des', key: 'DES', name: 'Design' },
    title: 'Cat dad tee',
    updatedAt: '2026-10-15T12:00:00.000Z',
    url: 'https://linear.app/haus-chat/issue/DES-142/cat-dad-tee',
};

export const pageInfo = (endCursor: string | null = null) => ({
    endCursor,
    hasNextPage: endCursor !== null,
});

import { describe, expect, test } from 'bun:test';
import { linearClientEntityId } from '@haus/api/linear-actor-meta';
import { linearGraphqlEndpoint } from '../src/linear-graphql.ts';
import {
    accessToken,
    callTool,
    data,
    fakeLinear,
    issueNode,
    linearError,
    workspaceMeta,
} from './fake-linear.ts';

const teams = () =>
    data({ teams: { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } } });

describe('Linear error mapping', () => {
    test('a 401 is linear_token_rejected so the Server refreshes and resends', async () => {
        const linear = fakeLinear({
            Teams: () => ({ body: { error: 'unauthorized' }, status: 401 }),
        });
        const { raw, result } = await callTool(linear, 'list_teams', {});
        expect(result.structuredContent).toEqual({
            error: {
                code: 'linear_token_rejected',
                message: 'Linear rejected the token.',
                retryable: false,
            },
        });
        expect(raw).not.toContain(accessToken);
    });

    test('an AUTHENTICATION_ERROR body is also linear_token_rejected', async () => {
        const linear = fakeLinear({
            Teams: () => linearError('AUTHENTICATION_ERROR', 'Authentication required'),
        });
        const { result } = await callTool(linear, 'list_teams', {});
        expect(result.structuredContent).toMatchObject({
            error: { code: 'linear_token_rejected' },
        });
    });

    test('RATELIMITED is retryable and carries the reset time', async () => {
        const reset = Date.parse('2026-10-15T13:00:00.000Z');
        const linear = fakeLinear({
            Teams: () => ({
                ...linearError('RATELIMITED', 'Rate limit exceeded'),
                headers: { 'X-RateLimit-Requests-Reset': String(reset) },
            }),
        });
        const { result } = await callTool(linear, 'list_teams', {});
        expect(result.structuredContent).toEqual({
            error: {
                code: 'linear_rate_limited',
                message: 'Linear rate limit reached; retry after the reset time.',
                resetAt: '2026-10-15T13:00:00.000Z',
                retryable: true,
            },
        });
    });

    test('a 5xx is a retryable upstream error', async () => {
        const linear = fakeLinear({ Teams: () => ({ body: 'bad gateway', status: 502 }) });
        const { result } = await callTool(linear, 'list_teams', {});
        expect(result.structuredContent).toMatchObject({
            error: { code: 'linear_upstream_error', retryable: true },
        });
    });

    test('a network failure is a retryable upstream error', async () => {
        const fetch = (() =>
            Promise.reject(new Error('ECONNRESET'))) as unknown as typeof globalThis.fetch;
        const { result } = await callTool({ fetch }, 'list_teams', {});
        expect(result.content[0]?.text).toBe('linear_upstream_error: Linear could not be reached.');
    });

    test('a false success is Linear refusing the input', async () => {
        const linear = fakeLinear({
            UpdateIssue: () => data({ issueUpdate: { issue: null, success: false } }),
        });
        const { result } = await callTool(linear, 'update_issue', {
            issue: 'DES-142',
            priority: 1,
        });
        expect(result.structuredContent).toMatchObject({ error: { code: 'linear_input_error' } });
    });
});

describe('deadlines', () => {
    test('the deadline aborts mid-call and reports the mutations that landed', async () => {
        const op1 = linearClientEntityId(workspaceMeta.idSeed, 1);
        let commentSignal: AbortSignal | undefined;
        const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as { query: string };
            if (body.query.includes('UpdateIssue')) {
                return Response.json({
                    data: { issueUpdate: { issue: issueNode, success: true } },
                });
            }
            commentSignal = init?.signal ?? undefined;
            return await new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
            });
        }) as typeof globalThis.fetch;
        const { report, result } = await callTool(
            { fetch },
            'update_issue',
            { issue: 'DES-142', note: 'Moving on.', priority: 1 },
            { deadlineMs: 1000 }
        );
        expect(commentSignal?.aborted).toBe(true);
        expect(result.content[0]?.text).toBe(
            'linear_upstream_error: Linear did not answer before the call deadline.'
        );
        expect(report.completed).toBe(false);
        expect(report.mutations).toMatchObject([{ entityType: 'issue', opIndex: 0 }]);
        expect(report.mutations.some((mutation) => mutation.clientId === op1)).toBe(false);
    });

    test('Linear is called at its GraphQL endpoint with the bearer token', async () => {
        const linear = fakeLinear({ Teams: teams });
        await callTool(linear, 'list_teams', {});
        expect(linear.urlRequests).toHaveLength(0);
        expect(linearGraphqlEndpoint).toBe('https://api.linear.app/graphql');
    });
});

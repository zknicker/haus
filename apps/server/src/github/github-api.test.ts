import { describe, expect, test } from 'bun:test';
import { GithubApiError, githubNextPage, githubRequest } from './github-api.ts';

function answering(status: number, body: unknown, headers: Record<string, string> = {}) {
    const calls: { init: RequestInit | undefined; url: string }[] = [];
    const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ init, url: String(input) });
        return Promise.resolve(
            new Response(body === null ? null : JSON.stringify(body), { headers, status })
        );
    }) as typeof fetch;
    return { calls, fetcher };
}

async function failureOf(status: number, headers: Record<string, string> = {}) {
    const { fetcher } = answering(status, { message: 'no' }, headers);
    const error = await githubRequest(
        { credential: { jwt: 'jwt', kind: 'app' }, path: '/app/installations/1' },
        { fetch: fetcher }
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(GithubApiError);
    return (error as GithubApiError).failure;
}

describe('githubRequest', () => {
    test('sends the credential, API version, and query, and parses the body', async () => {
        const { calls, fetcher } = answering(200, { id: 42 });
        const response = await githubRequest(
            {
                credential: { kind: 'user', token: 'ghu_user' },
                path: '/user/installations',
                query: { page: undefined, per_page: 100 },
            },
            { fetch: fetcher }
        );

        expect(response.body).toEqual({ id: 42 });
        expect(calls[0]?.url).toBe('https://api.github.com/user/installations?per_page=100');
        expect(calls[0]?.init?.headers).toMatchObject({
            accept: 'application/vnd.github+json',
            authorization: 'Bearer ghu_user',
            'x-github-api-version': '2022-11-28',
        });
    });

    test('classifies 404, retryable, and refused answers', async () => {
        expect(await failureOf(404)).toBe('not_found');
        expect(await failureOf(429)).toBe('retryable');
        expect(await failureOf(502)).toBe('retryable');
        expect(await failureOf(403, { 'x-ratelimit-remaining': '0' })).toBe('retryable');
        expect(await failureOf(403)).toBe('refused');
        expect(await failureOf(401)).toBe('refused');
    });

    test('a network error is retryable', async () => {
        const error = await githubRequest(
            { credential: { jwt: 'jwt', kind: 'app' }, path: '/app' },
            { fetch: (() => Promise.reject(new Error('reset'))) as unknown as typeof fetch }
        ).catch((cause: unknown) => cause);
        expect((error as GithubApiError).failure).toBe('retryable');
    });

    test('follows a Link URL on the API host and refuses any other host', async () => {
        const { calls, fetcher } = answering(200, []);
        await githubRequest(
            {
                credential: { jwt: 'jwt', kind: 'app' },
                path: 'https://api.github.com/app/hook/deliveries?cursor=abc',
            },
            { fetch: fetcher }
        );
        expect(calls[0]?.url).toBe('https://api.github.com/app/hook/deliveries?cursor=abc');
        await expect(
            githubRequest(
                { credential: { jwt: 'jwt', kind: 'app' }, path: 'https://evil.test/app' },
                { fetch: fetcher }
            )
        ).rejects.toThrow(/outside/u);
    });

    test('reads the next page from a Link header', () => {
        const headers = new Headers({
            link: '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"',
        });
        expect(githubNextPage(headers)).toBe('https://api.github.com/x?page=2');
        expect(githubNextPage(new Headers())).toBe(null);
    });
});

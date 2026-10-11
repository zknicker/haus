// The one HTTP path to GitHub's REST API. Endpoint wrappers (installations,
// memberships, the delivery log) build on `githubRequest`; its failure kinds
// are the classification reconciliation and recovery act on.

const githubApiBaseUrl = 'https://api.github.com';
const githubApiVersion = '2022-11-28';

/** Who a request acts as: the App itself (JWT) or the connection's GitHub user. */
export type GithubCredential = { jwt: string; kind: 'app' } | { kind: 'user'; token: string };

export interface GithubRequest {
    credential: GithubCredential;
    method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
    /** Path under the API root, such as `/app/installations/42`, or a full `Link` URL. */
    path: string;
    query?: Record<string, number | string | undefined>;
}

export interface GithubResponse {
    body: unknown;
    headers: Headers;
    status: number;
}

/**
 * Why a request failed. `retryable` (429, 5xx, a rate-limited 403, a network
 * error) changes nothing durable and is tried again later; `not_found` and
 * `refused` are answers the caller acts on.
 */
export type GithubApiFailure = 'not_found' | 'refused' | 'retryable';

export class GithubApiError extends Error {
    constructor(
        readonly failure: GithubApiFailure,
        readonly status: number | null,
        message: string
    ) {
        super(message);
        this.name = 'GithubApiError';
    }
}

export interface GithubApiTransport {
    baseUrl?: string;
    fetch?: typeof fetch;
}

/** Sends one request and answers the parsed 2xx body, or throws `GithubApiError`. */
export async function githubRequest(
    request: GithubRequest,
    transport: GithubApiTransport = {}
): Promise<GithubResponse> {
    const url = githubUrl(request, transport.baseUrl ?? githubApiBaseUrl);
    let response: Response;
    try {
        response = await (transport.fetch ?? fetch)(url, {
            headers: {
                accept: 'application/vnd.github+json',
                authorization: `Bearer ${
                    request.credential.kind === 'app'
                        ? request.credential.jwt
                        : request.credential.token
                }`,
                'x-github-api-version': githubApiVersion,
            },
            method: request.method ?? 'GET',
        });
    } catch (cause) {
        throw new GithubApiError('retryable', null, `GitHub request failed: ${String(cause)}`);
    }
    if (!response.ok) {
        throw new GithubApiError(
            classifyGithubFailure(response),
            response.status,
            `GitHub answered ${response.status} for ${request.method ?? 'GET'} ${url.pathname}.`
        );
    }
    const text = await response.text();
    return {
        body: text ? (JSON.parse(text) as unknown) : null,
        headers: response.headers,
        status: response.status,
    };
}

/** The `rel="next"` URL of a paginated answer, or null on the last page. */
export function githubNextPage(headers: Headers): string | null {
    const link = headers.get('link');
    const next = link?.split(',').find((part) => /rel="next"/u.test(part));
    return next?.match(/<([^>]+)>/u)?.[1] ?? null;
}

export function classifyGithubFailure(
    response: Pick<Response, 'headers' | 'status'>
): GithubApiFailure {
    const { status } = response;
    if (status === 404) {
        return 'not_found';
    }
    if (status === 429 || status >= 500 || (status === 403 && isRateLimited(response.headers))) {
        return 'retryable';
    }
    return 'refused';
}

function isRateLimited(headers: Headers) {
    return headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after');
}

function githubUrl(request: GithubRequest, baseUrl: string): URL {
    const url = /^https?:\/\//u.test(request.path)
        ? new URL(request.path)
        : new URL(`${baseUrl}${request.path}`);
    if (url.origin !== new URL(baseUrl).origin) {
        throw new Error(`Refusing a GitHub request outside ${baseUrl}: ${url.origin}`);
    }
    for (const [key, value] of Object.entries(request.query ?? {})) {
        if (value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    }
    return url;
}

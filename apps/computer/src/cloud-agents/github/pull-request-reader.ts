import { type CloudAgentPullRequest, cloudAgentPullRequestSchema } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Effect } from 'effect';
import { createGithubTokenReader } from './token.ts';

/**
 * The Computer's own GitHub reading of a pull request a Run opened. Cursor's
 * public Cloud Agents API reports no diff statistics, so the one place that
 * fact exists is GitHub, and the Computer is the layer that already holds
 * provider access. What crosses to Server is the bounded snapshot on the Run's
 * branch evidence — never the token, the diff, or anything else GitHub returns.
 *
 * A failed optional read resolves null and emits a safe diagnostic. Daemon
 * cancellation remains interruption so detached work cannot publish evidence.
 */

/** One total deadline includes token discovery, retry, and response consumption. */
const defaultTimeoutMs = 4000;
/** At most one read per pull request per window, however often a Run reports. */
const defaultThrottleMs = 30_000;

/** Only the one call this reader makes; Bun's `fetch` carries more than that. */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PullRequestAddress {
    number: number;
    owner: string;
    repo: string;
}

export interface PullRequestReader {
    read(pullRequestUrl: string, signal?: AbortSignal): Promise<CloudAgentPullRequest | null>;
}

export interface PullRequestReaderOptions {
    fetch?: FetchLike;
    now?: () => number;
    onDebug?: (message: string) => void;
    runtime: EffectRuntime<never>;
    throttleMs?: number;
    timeoutMs?: number;
    token?: (signal: AbortSignal) => Promise<string | null>;
}

export function createPullRequestReader(options: PullRequestReaderOptions): PullRequestReader {
    // Late-bound, so a Computer (or a test) that replaces `fetch` is honored.
    const request: FetchLike = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    const now = options.now ?? Date.now;
    const throttleMs = options.throttleMs ?? defaultThrottleMs;
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    const tokenPermit = options.runtime.runSync(Effect.makeSemaphore(1));
    const token = tokenPermit.withPermits(1)(
        options.token ? foreign(options.token) : createGithubTokenReader()
    );
    const cached = new Map<string, { at: number; snapshot: CloudAgentPullRequest | null }>();

    return {
        async read(
            pullRequestUrl: string,
            signal?: AbortSignal
        ): Promise<CloudAgentPullRequest | null> {
            signal?.throwIfAborted();
            const address = pullRequestAddressOf(pullRequestUrl);
            if (!address) {
                return null;
            }
            const key = `${address.owner}/${address.repo}#${address.number}`;
            const entry = cached.get(key);
            if (entry && now() - entry.at < throttleMs) {
                return entry.snapshot;
            }
            const snapshot = await settle(
                options.runtime,
                Effect.gen(function* () {
                    const authorization = yield* token;
                    return yield* foreign((requestSignal) =>
                        readSnapshot(address, authorization, requestSignal)
                    );
                }).pipe(
                    Effect.timeout(timeoutMs),
                    Effect.catchAll(() => {
                        const message = `GitHub pull request ${key} could not be read.`;
                        return (
                            options.onDebug
                                ? Effect.sync(() => options.onDebug?.(message))
                                : Effect.logDebug('GitHub pull request unavailable')
                        ).pipe(Effect.as(null));
                    })
                ),
                { signal }
            );
            signal?.throwIfAborted();
            cached.set(key, { at: now(), snapshot });
            return snapshot;
        },
    };

    /** One read, retried once on a 5xx because that is GitHub having a moment. */
    async function readSnapshot(
        address: PullRequestAddress,
        authorization: string | null,
        signal: AbortSignal
    ): Promise<CloudAgentPullRequest | null> {
        const first = await fetchPullRequest(address, authorization, signal);
        const payload = first.retryable
            ? (await fetchPullRequest(address, authorization, signal)).payload
            : first.payload;
        return payload ? pullRequestOf(payload, new Date(now()).toISOString()) : null;
    }

    async function fetchPullRequest(
        address: PullRequestAddress,
        authorization: string | null,
        signal: AbortSignal
    ): Promise<{ payload: unknown; retryable: boolean }> {
        signal.throwIfAborted();
        const response = await request(
            `https://api.github.com/repos/${encodeURIComponent(address.owner)}/${encodeURIComponent(
                address.repo
            )}/pulls/${address.number}`,
            {
                headers: {
                    accept: 'application/vnd.github+json',
                    ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
                    'x-github-api-version': '2022-11-28',
                },
                signal,
            }
        );
        if (!response.ok) {
            await response.body?.cancel();
            return { payload: null, retryable: response.status >= 500 };
        }
        return { payload: await response.json(), retryable: false };
    }
}

/**
 * The pull request a URL names, on GitHub only. Cursor may report a branch on
 * any host, but only GitHub's API is read here, so anything else yields no
 * address and therefore no snapshot.
 */
export function pullRequestAddressOf(pullRequestUrl: string): PullRequestAddress | null {
    let url: URL;
    try {
        url = new URL(pullRequestUrl);
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
        return null;
    }
    const matched = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/u.exec(url.pathname);
    const number = matched ? Number.parseInt(matched[3] as string, 10) : Number.NaN;
    if (!(matched && Number.isSafeInteger(number) && number > 0)) {
        return null;
    }
    return { number, owner: matched[1] as string, repo: matched[2] as string };
}

/**
 * GitHub's own vocabulary as Haus records it. `merged` outranks `closed`
 * because a merged pull request is also closed, and `draft` outranks `open`
 * because an open draft is not yet asking to be reviewed. A payload missing
 * the diff counts is not a snapshot: reporting zeros would be a lie.
 */
export function pullRequestOf(payload: unknown, observedAt: string): CloudAgentPullRequest | null {
    if (!isRecord(payload)) {
        return null;
    }
    const parsed = cloudAgentPullRequestSchema.safeParse({
        additions: payload.additions,
        changedFiles: payload.changed_files,
        deletions: payload.deletions,
        number: payload.number,
        observedAt,
        state: stateOf(payload),
    });
    return parsed.success ? parsed.data : null;
}

function stateOf(payload: Record<string, unknown>): string {
    if (payload.merged === true || typeof payload.merged_at === 'string') {
        return 'merged';
    }
    if (payload.state === 'closed') {
        return 'closed';
    }
    return payload.draft === true ? 'draft' : 'open';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function foreign<Value>(operation: (signal: AbortSignal) => Promise<Value>) {
    return Effect.async<Value, Error>((resume, signal) => {
        const pending = Promise.resolve().then(() => operation(signal));
        pending.then(
            (value) => resume(Effect.succeed(value)),
            (cause: unknown) =>
                resume(
                    Effect.fail(cause instanceof Error ? cause : new Error('GitHub request failed'))
                )
        );
        return Effect.promise(() =>
            pending.then(
                () => undefined,
                () => undefined
            )
        );
    });
}

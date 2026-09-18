import { z } from 'zod';
import { loadClaudeCredentials } from './credentials.ts';
import { ClaudeUsageAuthError, ClaudeUsageParseError, ClaudeUsageRequestError } from './errors.ts';
import type {
    ClaudeUsageOptions,
    ClaudeUsageSnapshot,
    ClaudeUsageWindow,
    ClaudeUsageWindowId,
} from './types.ts';

const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

const usageBucketSchema = z
    .object({
        resets_at: z.string().trim().min(1).nullable().optional(),
        utilization: z.number().finite().nullable().optional(),
    })
    .passthrough();

const extraUsageSchema = z
    .object({
        is_enabled: z.boolean().optional(),
        monthly_limit: z.number().finite().nullable().optional(),
        used_credits: z.number().finite().nullable().optional(),
    })
    .passthrough();

const claudeUsageResponseSchema = z
    .object({
        extra_usage: extraUsageSchema.optional(),
        five_hour: usageBucketSchema.nullable().optional(),
        seven_day: usageBucketSchema.nullable().optional(),
        seven_day_opus: usageBucketSchema.nullable().optional(),
        seven_day_sonnet: usageBucketSchema.nullable().optional(),
    })
    .passthrough();

export function normalizeClaudeUsageResponse(
    input: unknown,
    options: {
        capturedAt?: Date;
        source?: ClaudeUsageSnapshot['source'];
        subscriptionType?: string | null;
    } = {}
): ClaudeUsageSnapshot {
    const response = claudeUsageResponseSchema.parse(input);
    const windows: ClaudeUsageWindow[] = [];

    appendWindow(windows, 'current-session', 'Current session', response.five_hour);
    appendWindow(
        windows,
        'current-week-all-models',
        'Current week (all models)',
        response.seven_day
    );
    appendWindow(
        windows,
        'current-week-sonnet',
        'Current week (Sonnet only)',
        response.seven_day_sonnet
    );
    appendWindow(windows, 'current-week-opus', 'Current week (Opus only)', response.seven_day_opus);

    const extraUsage = response.extra_usage?.is_enabled
        ? {
              monthlyLimitUsd:
                  response.extra_usage.monthly_limit === null ||
                  response.extra_usage.monthly_limit === undefined
                      ? null
                      : response.extra_usage.monthly_limit / 100,
              usedUsd: (response.extra_usage.used_credits ?? 0) / 100,
          }
        : null;

    return {
        capturedAt: (options.capturedAt ?? new Date()).toISOString(),
        extraUsage,
        provider: 'claude',
        source: options.source ?? 'anthropic-oauth-usage',
        subscriptionType: options.subscriptionType ?? null,
        windows,
    };
}

export async function getClaudeUsage(
    options: ClaudeUsageOptions = {}
): Promise<ClaudeUsageSnapshot> {
    const fetchImpl = options.fetch ?? fetch;
    const signal = options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 15_000);
    const loaded = options.credentials
        ? {
              credentials: options.credentials,
              document: null,
              expired: false,
              path: null,
              source: 'manual' as const,
          }
        : await loadClaudeCredentials(options);

    if (!loaded) {
        throw new ClaudeUsageAuthError(
            'Claude credentials were not found. Run `claude` to log in first.'
        );
    }

    // Usage reporting has no way to spend a refresh token; the CLI owns that.
    if (loaded.expired) {
        throw new ClaudeUsageAuthError(
            'Claude access token expired. Run `claude` once to refresh it.'
        );
    }

    const credentials = loaded.credentials;
    const usageResponse = await fetchClaudeUsageResponse({
        accessToken: credentials.accessToken,
        fetch: fetchImpl,
        signal,
    });

    if (usageResponse.status === 401 || usageResponse.status === 403) {
        throw new ClaudeUsageAuthError('Claude session expired. Run `claude` to log in again.');
    }

    if (usageResponse.status !== 200) {
        throw new ClaudeUsageRequestError(
            `Claude usage request failed with HTTP ${usageResponse.status}`,
            usageResponse.status,
            parseRetryAfter(usageResponse.headers.get('retry-after'), options.now ?? new Date())
        );
    }

    const body = await usageResponse.json();
    try {
        return normalizeClaudeUsageResponse(body, {
            capturedAt: options.now,
            subscriptionType: credentials.subscriptionType,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new ClaudeUsageParseError('Claude usage response shape changed');
        }

        throw error;
    }
}

function parseRetryAfter(value: string | null, now: Date): number | null {
    if (!value) {
        return null;
    }
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - now.getTime()) : null;
}

function appendWindow(
    windows: ClaudeUsageWindow[],
    id: ClaudeUsageWindowId,
    label: string,
    bucket:
        | {
              resets_at?: string | null;
              utilization?: number | null;
          }
        | null
        | undefined
): void {
    if (bucket?.utilization === undefined || bucket.utilization === null) {
        return;
    }

    const usedPercent = clampPercent(bucket.utilization);
    windows.push({
        id,
        label,
        remainingPercent: clampPercent(100 - usedPercent),
        resetsAt: bucket.resets_at ?? null,
        usedPercent,
    });
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

async function fetchClaudeUsageResponse(options: {
    accessToken: string;
    fetch: typeof fetch;
    signal: AbortSignal;
}): Promise<Response> {
    return options.fetch(CLAUDE_USAGE_URL, {
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${options.accessToken.trim()}`,
            'content-type': 'application/json',
            'anthropic-beta': 'oauth-2025-04-20',
        },
        method: 'GET',
        signal: options.signal,
    });
}

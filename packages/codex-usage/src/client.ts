import * as z from 'zod';
import { loadCodexCredentials } from './credentials.ts';
import { CodexUsageAuthError, CodexUsageParseError, CodexUsageRequestError } from './errors.ts';
import { coerceNumber, headerNumber } from './field-values.ts';
import type { CodexUsageOptions, CodexUsageSnapshot } from './types.ts';
import { buildUsageWindows } from './usage-windows.ts';

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const codexUsageWindowSchema = z.record(z.string(), z.unknown()).nullable().optional();

const codexUsageResponseSchema = z
    .object({
        credits: z
            .object({
                balance: z
                    .union([z.number().finite(), z.string().trim().min(1)])
                    .nullable()
                    .optional(),
            })
            .passthrough()
            .optional(),
        plan_type: z.string().trim().min(1).optional(),
        rate_limit: z
            .object({
                primary_window: codexUsageWindowSchema,
                secondary_window: codexUsageWindowSchema,
            })
            .passthrough()
            .optional(),
    })
    .passthrough();

export function normalizeCodexUsageResponse(
    input: unknown,
    options: {
        capturedAt?: Date;
        headers?: Headers;
        now?: Date;
    } = {}
): CodexUsageSnapshot {
    const response = codexUsageResponseSchema.parse(input);
    const now = options.now ?? new Date();

    return {
        capturedAt: (options.capturedAt ?? now).toISOString(),
        creditsBalance:
            headerNumber(options.headers, 'x-codex-credits-balance') ??
            coerceNumber(response.credits?.balance) ??
            null,
        planType: response.plan_type ?? null,
        provider: 'codex',
        source: 'chatgpt-wham-usage',
        windows: buildUsageWindows({
            headers: options.headers,
            now,
            primaryWindow: response.rate_limit?.primary_window ?? undefined,
            secondaryWindow: response.rate_limit?.secondary_window ?? undefined,
        }),
    };
}

export async function getCodexUsage(options: CodexUsageOptions = {}): Promise<CodexUsageSnapshot> {
    const fetchImpl = options.fetch ?? fetch;
    const signal = options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 15_000);
    const loaded = options.credentials
        ? {
              credentials: options.credentials,
              document: { tokens: {} },
              path: '',
              source: 'manual' as const,
          }
        : await loadCodexCredentials(options);

    if (!loaded) {
        throw new CodexUsageAuthError('Codex auth was not found. Run `codex` to log in first.');
    }

    const credentials = loaded.credentials;
    const usageResponse = await fetchCodexUsageResponse({
        accessToken: credentials.accessToken,
        accountId: credentials.accountId,
        fetch: fetchImpl,
        signal,
    });

    if (usageResponse.status === 401 || usageResponse.status === 403) {
        throw new CodexUsageAuthError('Codex session expired. Run `codex` to log in again.');
    }

    if (usageResponse.status !== 200) {
        throw new CodexUsageRequestError(
            `Codex usage request failed with HTTP ${usageResponse.status}`,
            usageResponse.status
        );
    }

    const body = await usageResponse.json();
    try {
        return normalizeCodexUsageResponse(body, {
            capturedAt: options.now,
            headers: usageResponse.headers,
            now: options.now,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new CodexUsageParseError('Codex usage response shape changed');
        }

        throw error;
    }
}

async function fetchCodexUsageResponse(options: {
    accessToken: string;
    accountId: string | null;
    fetch: typeof fetch;
    signal: AbortSignal;
}): Promise<Response> {
    const headers = new Headers({
        accept: 'application/json',
        authorization: `Bearer ${options.accessToken}`,
    });

    if (options.accountId) {
        headers.set('ChatGPT-Account-Id', options.accountId);
    }

    return options.fetch(CODEX_USAGE_URL, {
        headers,
        method: 'GET',
        signal: options.signal,
    });
}

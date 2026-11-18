import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { UsageOverview } from '@haus/api';
import * as z from 'zod';

const DEFAULT_PROXY_URL = 'https://cli-chat-proxy.grok.com/v1';
const TOKEN_AUTH_HEADER = 'xai-grok-cli';

const authSchema = z
    .object({
        expires_at: z.iso.datetime({ offset: true }).optional(),
        key: z.string().min(1),
        user_id: z.string().min(1),
    })
    .passthrough();

const centsSchema = z.object({ val: z.number().int().default(0) }).passthrough();
const billingResponseSchema = z
    .object({
        config: z
            .object({
                billingPeriodEnd: z.string().optional(),
                creditUsagePercent: z.number().optional(),
                currentPeriod: z
                    .object({
                        end: z.string().optional(),
                        start: z.string().optional(),
                        type: z.string().optional(),
                    })
                    .passthrough()
                    .optional(),
                monthlyLimit: centsSchema.optional(),
                used: centsSchema.optional(),
            })
            .passthrough()
            .nullable(),
    })
    .passthrough();

type GrokUsageSnapshot = Extract<UsageOverview['grok'], { status: 'ok' }>['snapshot'];

export async function getGrokUsage(
    options: {
        authFile?: string;
        fetch?: (input: string, init: RequestInit) => Promise<Response>;
        now?: Date;
        proxyUrl?: string;
        version?: string;
    } = {}
): Promise<GrokUsageSnapshot> {
    const now = options.now ?? new Date();
    const authFile =
        options.authFile ??
        join(process.env.GROK_HOME?.trim() || join(homedir(), '.grok'), 'auth.json');
    const auth = await readGrokAuth(authFile, now);
    const response = await (options.fetch ?? fetch)(
        `${options.proxyUrl ?? (process.env.GROK_CLI_CHAT_PROXY_BASE_URL?.trim() || DEFAULT_PROXY_URL)}/billing?format=credits`,
        {
            headers: {
                Authorization: `Bearer ${auth.key}`,
                'X-XAI-Token-Auth': TOKEN_AUTH_HEADER,
                'x-grok-client-mode': 'headless',
                'x-grok-client-version': options.version ?? '1',
                'x-userid': auth.user_id,
            },
            signal: AbortSignal.timeout(15_000),
        }
    );
    if (!response.ok) {
        throw new Error(`Grok usage request failed with status ${response.status}.`);
    }
    return normalizeGrokUsage(billingResponseSchema.parse(await response.json()), now);
}

export function normalizeGrokUsage(
    response: z.infer<typeof billingResponseSchema>,
    now: Date
): GrokUsageSnapshot {
    const config = response.config;
    if (!config) {
        throw new Error('Grok usage response did not include a billing configuration.');
    }
    const legacyLimit = config.monthlyLimit?.val ?? 0;
    const usedPercent = clampPercent(
        config.creditUsagePercent ??
            (legacyLimit > 0 ? ((config.used?.val ?? 0) / legacyLimit) * 100 : 0)
    );
    const periodType = config.currentPeriod?.type;
    const resetValue = config.currentPeriod?.end ?? config.billingPeriodEnd;

    return {
        capturedAt: now.toISOString(),
        provider: 'grok',
        source: 'grok-build-credits',
        windows: [
            {
                id: 'current-period',
                label: periodLabel(periodType),
                remainingPercent: 100 - usedPercent,
                resetsAt: validTimestamp(resetValue),
                usedPercent,
            },
        ],
    };
}

async function readGrokAuth(path: string, now: Date) {
    const store = z.record(z.string(), z.unknown()).parse(JSON.parse(await readFile(path, 'utf8')));
    const candidates = Object.entries(store).sort(([left], [right]) => {
        return authScopePriority(left) - authScopePriority(right);
    });
    for (const [scope, rawAuth] of candidates) {
        if (authScopePriority(scope) >= 2) {
            continue;
        }
        const parsed = authSchema.safeParse(rawAuth);
        if (!parsed.success) {
            continue;
        }
        if (parsed.data.expires_at && Date.parse(parsed.data.expires_at) <= now.getTime()) {
            continue;
        }
        return parsed.data;
    }
    throw new Error('No current Grok login is available.');
}

function authScopePriority(scope: string): number {
    if (scope.startsWith('https://auth.x.ai::')) {
        return 0;
    }
    return scope === 'https://accounts.x.ai/sign-in' ? 1 : 2;
}

function periodLabel(periodType: string | undefined): string {
    if (periodType?.endsWith('_WEEKLY')) {
        return 'Weekly Limit';
    }
    if (periodType?.endsWith('_MONTHLY')) {
        return 'Monthly Limit';
    }
    return 'Credits';
}

function clampPercent(value: number): number {
    return Math.min(100, Math.max(0, value));
}

function validTimestamp(value: string | undefined): string | null {
    return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

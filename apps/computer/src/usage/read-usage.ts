import type { RuntimeTokenUsageSnapshot, UsageOverview } from '@haus/api';
import { getCodexUsage } from '@haus/codex-usage';
import { readClaudeLocalUsage } from './claude-local-usage.ts';
import { type ClaudePlanUsageReadOptions, readClaudePlanUsage } from './claude-plan-usage.ts';
import { readGrokLocalUsage } from './grok-local-usage.ts';
import { getGrokUsage } from './grok-usage.ts';
import { readOpenRouterUsage } from './openrouter-usage.ts';
import { reportUsageFailure, type UsageFailureLog, usageFailure } from './usage-failure.ts';

export async function readComputerUsage(
    options: {
        loadClaudeUsage?: (
            options: ClaudePlanUsageReadOptions
        ) => ReturnType<typeof readClaudePlanUsage>;
        loadClaudeLocalUsage?: typeof readClaudeLocalUsage;
        loadCodexUsage?: typeof getCodexUsage;
        loadGrokLocalUsage?: typeof readGrokLocalUsage;
        loadGrokUsage?: typeof getGrokUsage;
        loadOpenRouterUsage?: typeof readOpenRouterUsage;
        logUsageFailure?: UsageFailureLog;
        dataRoot?: string;
        force?: boolean;
        now?: () => Date;
        openRouterManagementKey?: string | null;
    } = {}
): Promise<UsageOverview> {
    const now = options.now?.() ?? new Date();
    const log = options.logUsageFailure ?? reportUsageFailure;
    const loadClaudeUsage = options.loadClaudeUsage ?? readClaudePlanUsage;
    const loadClaudeLocalUsage = options.loadClaudeLocalUsage ?? readClaudeLocalUsage;
    const loadCodexUsage = options.loadCodexUsage ?? getCodexUsage;
    const loadGrokLocalUsage = options.loadGrokLocalUsage ?? readGrokLocalUsage;
    const loadGrokUsage = options.loadGrokUsage ?? getGrokUsage;
    const loadOpenRouterUsage = options.loadOpenRouterUsage ?? readOpenRouterUsage;
    const [claude, codex, grok, openRouter, claudeLocal, grokLocal] = await Promise.all([
        loadClaudeUsage({ dataRoot: options.dataRoot, force: options.force, now })
            .then((snapshot) => ({
                provider: 'claude' as const,
                snapshot,
                status: 'ok' as const,
            }))
            .catch((cause: unknown) => ({
                error: usageFailure(
                    'claude',
                    cause,
                    'Claude usage is unavailable on this Computer.',
                    log
                ),
                provider: 'claude' as const,
                status: 'error' as const,
            })),
        loadCodexUsage({ now })
            .then((snapshot) => ({
                provider: 'codex' as const,
                snapshot,
                status: 'ok' as const,
            }))
            .catch((cause: unknown) => ({
                error: usageFailure(
                    'codex',
                    cause,
                    'Codex usage is unavailable on this Computer.',
                    log
                ),
                provider: 'codex' as const,
                status: 'error' as const,
            })),
        loadGrokUsage({ now })
            .then((snapshot) => ({
                provider: 'grok' as const,
                snapshot,
                status: 'ok' as const,
            }))
            .catch((cause: unknown) => ({
                error: usageFailure(
                    'grok',
                    cause,
                    'Grok usage is unavailable on this Computer.',
                    log
                ),
                provider: 'grok' as const,
                status: 'error' as const,
            })),
        loadOpenRouterUsage(now, {
            managementApiKey: options.openRouterManagementKey,
        })
            .then((overview) => ({
                error: null,
                overview,
                status: 'ok' as const,
            }))
            .catch((cause: unknown) => ({
                error: usageFailure(
                    'openrouter',
                    cause,
                    'OpenRouter usage is unavailable on this Computer.',
                    log
                ),
                overview: {
                    days: 0,
                    keys: [],
                    message: 'OpenRouter usage is unavailable.',
                    note: null,
                    series: [],
                    status: 'empty' as const,
                    totalByokUsageUsd: 0,
                    totalRequests: 0,
                    totalUsageUsd: 0,
                },
                status: 'error' as const,
            })),
        readRuntimeUsageState('claude-code', () => loadClaudeLocalUsage({ now }), log),
        readRuntimeUsageState('grok-build', () => loadGrokLocalUsage({ now }), log),
    ]);
    const connectedProviders: UsageOverview['connectedProviders'] = [];
    if (claude.status === 'ok' || claudeLocal?.status === 'ok') {
        connectedProviders.push('claude-code');
    }
    if (codex.status === 'ok') {
        connectedProviders.push('openai-codex');
    }
    if (grok.status === 'ok' || grokLocal?.status === 'ok') {
        connectedProviders.push('grok-build');
    }
    if (openRouter.status === 'ok' && openRouter.overview.status !== 'unconfigured') {
        connectedProviders.push('openrouter');
    }

    return {
        capturedAt: now.toISOString(),
        claude,
        codex,
        connectedProviders,
        grok,
        openRouter,
        runtimeUsage: [claudeLocal, grokLocal].filter(
            (state): state is NonNullable<typeof state> => state !== null
        ),
    };
}

async function readRuntimeUsageState(
    runtimeId: 'claude-code' | 'grok-build',
    load: () => Promise<RuntimeTokenUsageSnapshot | null>,
    log: UsageFailureLog
): Promise<UsageOverview['runtimeUsage'][number] | null> {
    try {
        const snapshot = await load();
        return snapshot ? { runtimeId, snapshot, status: 'ok' } : null;
    } catch (cause) {
        return {
            error: usageFailure(runtimeId, cause, `${runtimeId} token usage is unavailable.`, log),
            runtimeId,
            status: 'error',
        };
    }
}

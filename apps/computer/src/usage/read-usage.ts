import type { UsageOverview } from '@haus/api';
import { getCodexUsage } from '@haus/codex-usage';
import { type ClaudePlanUsageReadOptions, readClaudePlanUsage } from './claude-plan-usage.ts';
import { getGrokUsage } from './grok-usage.ts';
import { readOpenRouterUsage } from './openrouter-usage.ts';
import { reportUsageFailure, type UsageFailureLog, usageFailure } from './usage-failure.ts';

export async function readComputerUsage(
    options: {
        loadClaudeUsage?: (
            options: ClaudePlanUsageReadOptions
        ) => ReturnType<typeof readClaudePlanUsage>;
        loadCodexUsage?: typeof getCodexUsage;
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
    const loadCodexUsage = options.loadCodexUsage ?? getCodexUsage;
    const loadGrokUsage = options.loadGrokUsage ?? getGrokUsage;
    const loadOpenRouterUsage = options.loadOpenRouterUsage ?? readOpenRouterUsage;
    const [claude, codex, grok, openRouter] = await Promise.all([
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
    ]);
    const connectedProviders: UsageOverview['connectedProviders'] = [];
    if (claude.status === 'ok') {
        connectedProviders.push('claude-code');
    }
    if (codex.status === 'ok') {
        connectedProviders.push('openai-codex');
    }
    if (grok.status === 'ok') {
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
    };
}

import type { ModelConnectionCapacityWindow, RunnerModelConnection } from '@haus/api';
import {
    CodexUsageAuthError,
    CodexUsageRequestError,
    type CodexUsageWindowId,
    getCodexUsage,
} from '@haus/codex-usage';

export interface CapacityUsageUrls {
    readonly chatgpt?: string;
}

export type ReadFailure =
    | { readonly kind: 'failed' }
    | { readonly kind: 'rate-limited'; readonly retryAfterMs: number | null }
    | { readonly kind: 'refused' };

export function readsCapacity(connection: RunnerModelConnection) {
    return connection.provider === 'chatgpt' && connection.credential.kind === 'oauth';
}

export async function readWindows(
    connection: RunnerModelConnection,
    readAt: Date,
    urls: CapacityUsageUrls
) {
    const { credential } = connection;
    if (!(connection.provider === 'chatgpt' && credential.kind === 'oauth')) {
        throw new Error(
            `A ${connection.provider} ${credential.kind} connection has no capacity reader.`
        );
    }
    const { access, accountId, expires } = credential.credential;
    if (expires <= readAt.getTime()) {
        throw new Error('The access token has expired; the next turn refreshes it.');
    }
    const usage = await getCodexUsage({
        credentials: {
            accessToken: access,
            accountId: typeof accountId === 'string' ? accountId : null,
            lastRefresh: null,
            refreshToken: null,
        },
        now: readAt,
        ...(urls.chatgpt ? { usageUrl: urls.chatgpt } : {}),
    });
    return usage.windows.map((window) => capacityWindow(window, chatgptLabels[window.id]));
}

export function readFailure(error: unknown) {
    if (error instanceof CodexUsageAuthError) {
        const refused: ReadFailure = { kind: 'refused' };
        return refused;
    }
    if (error instanceof CodexUsageRequestError && error.status === 429) {
        const limited: ReadFailure = { kind: 'rate-limited', retryAfterMs: error.retryAfterMs };
        return limited;
    }
    const failed: ReadFailure = { kind: 'failed' };
    return failed;
}

function capacityWindow(
    window: { id: string; resetsAt: string | null; usedPercent: number },
    label: string
) {
    const resetsAt = window.resetsAt === null ? Number.NaN : Date.parse(window.resetsAt);
    const mapped: ModelConnectionCapacityWindow = {
        id: window.id,
        label,
        resetsAt: Number.isFinite(resetsAt) ? new Date(resetsAt).toISOString() : null,
        usedPercent: window.usedPercent,
    };
    return mapped;
}

const chatgptLabels: Record<CodexUsageWindowId, string> = {
    'current-session': '5-hour',
    'current-week': 'Weekly',
};

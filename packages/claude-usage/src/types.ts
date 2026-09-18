export interface ClaudeCredentials {
    accessToken: string;
    expiresAt: number | null;
    refreshToken: string | null;
    subscriptionType: string | null;
}

export type ClaudeCredentialsSource = 'environment' | 'file' | 'keychain' | 'manual';

export interface ClaudeLoadedCredentials {
    credentials: ClaudeCredentials;
    document: Record<string, unknown> | null;
    /** The access token is past its expiry; only `claude` itself can refresh it. */
    expired: boolean;
    path: string | null;
    source: ClaudeCredentialsSource;
}

export type ClaudeUsageWindowId =
    | 'current-session'
    | 'current-week-all-models'
    | 'current-week-opus'
    | 'current-week-sonnet';

export interface ClaudeUsageWindow {
    id: ClaudeUsageWindowId;
    label: string;
    remainingPercent: number;
    resetsAt: string | null;
    usedPercent: number;
}

export interface ClaudeExtraUsage {
    monthlyLimitUsd: number | null;
    usedUsd: number;
}

export interface ClaudeUsageSnapshot {
    capturedAt: string;
    extraUsage: ClaudeExtraUsage | null;
    provider: 'claude';
    source: 'anthropic-oauth-usage' | 'claude-code-sdk-usage';
    subscriptionType: string | null;
    windows: ClaudeUsageWindow[];
}

export interface ClaudeCredentialsLoadOptions {
    credentialsPath?: string;
    environment?: NodeJS.ProcessEnv;
    homeDir?: string;
    keychainService?: string;
    now?: Date;
    platform?: NodeJS.Platform;
    readKeychain?: (service: string) => Promise<string | null>;
    useKeychain?: boolean;
}

export interface ClaudeUsageOptions extends ClaudeCredentialsLoadOptions {
    credentials?: ClaudeCredentials;
    fetch?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface CodexCredentials {
    accessToken: string;
    accountId: string | null;
    lastRefresh: string | null;
    refreshToken: string | null;
}

export type CodexCredentialsSource = 'file' | 'manual';

export interface CodexLoadedCredentials {
    credentials: CodexCredentials;
    document: Record<string, unknown>;
    path: string;
    source: CodexCredentialsSource;
}

export interface CodexAccessTokenMetadata {
    email: string | null;
    planType: string | null;
}

export type CodexUsageWindowId = 'current-session' | 'current-week';

export interface CodexUsageWindow {
    id: CodexUsageWindowId;
    label: string;
    remainingPercent: number;
    resetAfterSeconds: number | null;
    resetsAt: string | null;
    usedPercent: number;
}

export interface CodexUsageSnapshot {
    capturedAt: string;
    creditsBalance: number | null;
    planType: string | null;
    provider: 'codex';
    source: 'chatgpt-wham-usage';
    windows: CodexUsageWindow[];
}

export interface CodexCredentialsLoadOptions {
    authPath?: string;
    codexHome?: string;
    environment?: NodeJS.ProcessEnv;
    homeDir?: string;
}

export interface CodexUsageOptions extends CodexCredentialsLoadOptions {
    credentials?: CodexCredentials;
    fetch?: typeof fetch;
    now?: Date;
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Defaults to ChatGPT's `wham/usage` endpoint. */
    usageUrl?: string;
}

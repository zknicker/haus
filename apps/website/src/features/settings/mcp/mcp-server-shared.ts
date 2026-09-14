import type { McpIcon } from '@haus/api';
export interface McpConnection {
    accountLabel: string | null;
    affectedAgents: Array<{ id: string; name: string }>;
    auth: 'headers' | 'none' | 'oauth';
    builtIn: boolean;
    connected: boolean;
    headerNames: string[];
    icon: McpIcon | null;
    id: string;
    name: string;
    preset: 'google-calendar' | 'merchbase' | null;
    summary: string | null;
    url: string;
}
export interface McpConnectionTool {
    description: string;
    name: string;
    title: string | null;
}
export interface McpConnectionSaveInput {
    auth: 'headers' | 'none' | 'oauth';
    headers?: Record<string, string>;
    name: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthScopes?: string[];
    url: string;
}

export interface SecretDraftEntry {
    key: string;
    name: string;
    value: string;
}

export interface McpConnectionDraft {
    auth: 'headers' | 'none' | 'oauth';
    headers: SecretDraftEntry[];
    name: string;
    oauthClientId: string;
    oauthClientSecret: string;
    oauthScopes: string;
    url: string;
}

export function connectionStatusLabel(
    connection: Pick<McpConnection, 'auth' | 'connected'>
): string {
    if (connection.auth === 'oauth') {
        return connection.connected ? 'Account connected' : 'Sign in required';
    }
    if (connection.auth === 'headers') {
        return connection.connected ? 'Credentials saved' : 'Credentials required';
    }
    return connection.connected ? 'Ready' : 'Unavailable';
}

export function connectionSetupDescription(connection: Pick<McpConnection, 'auth'>): string {
    if (connection.auth === 'oauth') {
        return 'This MCP is added to Haus. Sign in to your account to authorize access and load its tools.';
    }
    if (connection.auth === 'headers') {
        return 'This MCP is added to Haus. Add credentials to authorize access and load its tools.';
    }
    return 'This MCP is added to Haus, but its tools are unavailable.';
}

export function createConnectionDraft(): McpConnectionDraft {
    return {
        auth: 'none',
        headers: [],
        name: '',
        oauthClientId: '',
        oauthClientSecret: '',
        oauthScopes: '',
        url: '',
    };
}

export function buildSaveInput(draft: McpConnectionDraft): McpConnectionSaveInput {
    const headers = toSecretRecord(draft.headers);
    return {
        auth: draft.auth,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        name: draft.name.trim(),
        oauthClientId: draft.auth === 'oauth' ? draft.oauthClientId.trim() || undefined : undefined,
        oauthClientSecret:
            draft.auth === 'oauth' ? draft.oauthClientSecret || undefined : undefined,
        oauthScopes: draft.auth === 'oauth' ? splitArgs(draft.oauthScopes) : undefined,
        url: draft.url.trim(),
    };
}

export function createSecretDraftEntry(): SecretDraftEntry {
    return { key: crypto.randomUUID(), name: '', value: '' };
}

export function splitArgs(value: string) {
    return value.split(/\s+/u).filter(Boolean);
}

export function toSecretRecord(entries: SecretDraftEntry[]) {
    return Object.fromEntries(
        entries
            .map((entry) => [entry.name.trim(), entry.value] as const)
            .filter(([name]) => name.length > 0)
    );
}

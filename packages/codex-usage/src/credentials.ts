import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexUsageParseError } from './errors.ts';
import type {
    CodexCredentials,
    CodexCredentialsLoadOptions,
    CodexLoadedCredentials,
} from './types.ts';

export function resolveCodexAuthPath(options: CodexCredentialsLoadOptions = {}): string {
    if (options.authPath) {
        return options.authPath;
    }

    if (options.codexHome) {
        return path.join(options.codexHome, 'auth.json');
    }

    const codexHome = options.environment?.CODEX_HOME?.trim();
    if (codexHome) {
        return path.join(codexHome, 'auth.json');
    }

    return path.join(options.homeDir ?? os.homedir(), '.codex', 'auth.json');
}

export function parseCodexAuthDocument(input: unknown): {
    credentials: CodexCredentials;
    document: Record<string, unknown>;
} {
    const document = parseCodexAuthRecord(input);
    const tokens = parseCodexTokens(document.tokens);

    return {
        credentials: {
            accessToken: tokens.accessToken,
            accountId: tokens.accountId,
            lastRefresh: document.last_refresh ?? null,
            refreshToken: tokens.refreshToken,
        },
        document,
    };
}

export async function loadCodexCredentials(
    options: CodexCredentialsLoadOptions = {}
): Promise<CodexLoadedCredentials | null> {
    const authPath = resolveCodexAuthPath(options);

    try {
        const raw = await readFile(authPath, 'utf8');
        const parsed = parseCodexAuthDocument(JSON.parse(raw));

        return {
            credentials: parsed.credentials,
            document: parsed.document,
            path: authPath,
            source: 'file',
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        if (error instanceof SyntaxError || error instanceof CodexUsageParseError) {
            throw new CodexUsageParseError(`Invalid Codex auth file at ${authPath}`);
        }

        throw error;
    }
}

function parseCodexAuthRecord(input: unknown): Record<string, unknown> & {
    last_refresh?: string;
    tokens: unknown;
} {
    if (!(input && typeof input === 'object' && !Array.isArray(input))) {
        throw new CodexUsageParseError('Invalid Codex auth document.');
    }
    const record = input as Record<string, unknown>;
    if (record.last_refresh !== undefined && !isNonEmptyString(record.last_refresh)) {
        throw new CodexUsageParseError('Invalid Codex auth last refresh.');
    }
    if (!('tokens' in record)) {
        throw new CodexUsageParseError('Invalid Codex auth tokens.');
    }
    return record as Record<string, unknown> & { last_refresh?: string; tokens: unknown };
}

function parseCodexTokens(input: unknown): {
    accessToken: string;
    accountId: string | null;
    refreshToken: string | null;
} {
    if (!(input && typeof input === 'object' && !Array.isArray(input))) {
        throw new CodexUsageParseError('Invalid Codex auth tokens.');
    }
    const tokens = input as Record<string, unknown>;
    if (!isNonEmptyString(tokens.access_token)) {
        throw new CodexUsageParseError('Invalid Codex access token.');
    }
    if (tokens.account_id !== undefined && !isNonEmptyString(tokens.account_id)) {
        throw new CodexUsageParseError('Invalid Codex account id.');
    }
    if (tokens.refresh_token !== undefined && !isNonEmptyString(tokens.refresh_token)) {
        throw new CodexUsageParseError('Invalid Codex refresh token.');
    }
    return {
        accessToken: tokens.access_token,
        accountId: tokens.account_id ?? null,
        refreshToken: tokens.refresh_token ?? null,
    };
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

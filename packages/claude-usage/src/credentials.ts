import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { ClaudeUsageAuthError } from './errors.ts';
import type {
    ClaudeCredentials,
    ClaudeCredentialsLoadOptions,
    ClaudeLoadedCredentials,
} from './types.ts';

const execFileAsync = promisify(execFile);
const DEFAULT_KEYCHAIN_SERVICE = 'Claude Code-credentials';

const claudeOauthSchema = z
    .object({
        accessToken: z.string().trim().min(1),
        expiresAt: z.number().finite().optional(),
        refreshToken: z.string().trim().min(1).optional(),
        subscriptionType: z.string().trim().min(1).optional(),
    })
    .passthrough();

const claudeCredentialsDocumentSchema = z
    .object({
        claudeAiOauth: claudeOauthSchema,
    })
    .passthrough();

export function resolveClaudeCredentialsPath(options: ClaudeCredentialsLoadOptions = {}): string {
    return (
        options.credentialsPath ??
        path.join(options.homeDir ?? os.homedir(), '.claude', '.credentials.json')
    );
}

export function parseClaudeCredentialsDocument(input: unknown): {
    credentials: ClaudeCredentials;
    document: Record<string, unknown>;
} {
    const document = claudeCredentialsDocumentSchema.parse(input);

    return {
        credentials: {
            accessToken: document.claudeAiOauth.accessToken,
            expiresAt: document.claudeAiOauth.expiresAt ?? null,
            refreshToken: document.claudeAiOauth.refreshToken ?? null,
            subscriptionType: document.claudeAiOauth.subscriptionType ?? null,
        },
        document,
    };
}

/**
 * Resolve the host's Claude Code login, first usable credential wins.
 *
 * The access token lives about eight hours; the `claude` CLI trades the refresh
 * token for a new one on its next run. An expired credential that still carries
 * a refresh token is therefore a stale login, not a missing one: it comes back
 * with `expired: true` and the caller decides what that is worth. Only a login
 * nothing can revive — no credential at all, or an expired one without a
 * refresh token — is null.
 */
export async function loadClaudeCredentials(
    options: ClaudeCredentialsLoadOptions = {}
): Promise<ClaudeLoadedCredentials | null> {
    const now = options.now ?? new Date();
    const keychainFirst = (options.platform ?? process.platform) === 'darwin';
    const readSources = keychainFirst
        ? [loadKeychainCredentials, loadFileCredentials, loadEnvironmentCredentials]
        : [loadFileCredentials, loadKeychainCredentials, loadEnvironmentCredentials];

    let refreshable: ClaudeLoadedCredentials | null = null;
    for (const readSource of readSources) {
        const candidate = await readSource(options, now);
        if (!candidate) {
            continue;
        }
        if (!candidate.expired) {
            return candidate;
        }
        if (!refreshable && candidate.credentials.refreshToken) {
            refreshable = candidate;
        }
    }

    return refreshable;
}

async function loadKeychainCredentials(
    options: ClaudeCredentialsLoadOptions,
    now: Date
): Promise<ClaudeLoadedCredentials | null> {
    if (options.useKeychain === false) {
        return null;
    }
    const keychainJson = await (options.readKeychain ?? readClaudeKeychain)(
        options.keychainService ?? DEFAULT_KEYCHAIN_SERVICE
    );
    if (!keychainJson) {
        return null;
    }
    try {
        const parsed = parseClaudeCredentialsDocument(JSON.parse(keychainJson));
        return {
            credentials: parsed.credentials,
            document: parsed.document,
            expired: credentialsExpired(parsed.credentials, now),
            path: null,
            source: 'keychain',
        };
    } catch (error) {
        if (error instanceof SyntaxError || error instanceof z.ZodError) {
            throw new ClaudeUsageAuthError(
                'Claude authentication failed: invalid credentials in Keychain'
            );
        }
        throw error;
    }
}

async function loadFileCredentials(
    options: ClaudeCredentialsLoadOptions,
    now: Date
): Promise<ClaudeLoadedCredentials | null> {
    const credentialsPath = resolveClaudeCredentialsPath(options);
    let raw: string;
    try {
        raw = await readFile(credentialsPath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }

    try {
        const parsed = parseClaudeCredentialsDocument(JSON.parse(raw));
        return {
            credentials: parsed.credentials,
            document: parsed.document,
            expired: credentialsExpired(parsed.credentials, now),
            path: credentialsPath,
            source: 'file',
        };
    } catch (error) {
        if (error instanceof SyntaxError || error instanceof z.ZodError) {
            throw new ClaudeUsageAuthError(
                'Claude authentication failed: invalid credentials in credential file'
            );
        }
        throw error;
    }
}

function loadEnvironmentCredentials(
    options: ClaudeCredentialsLoadOptions
): Promise<ClaudeLoadedCredentials | null> {
    const token = options.environment?.CLAUDE_CODE_OAUTH_TOKEN?.trim();
    if (!token) {
        return Promise.resolve(null);
    }

    return Promise.resolve({
        credentials: {
            accessToken: token,
            expiresAt: null,
            refreshToken: null,
            subscriptionType: null,
        },
        document: null,
        expired: false,
        path: null,
        source: 'environment',
    });
}

function credentialsExpired(credentials: ClaudeCredentials, now: Date): boolean {
    return credentials.expiresAt !== null && credentials.expiresAt <= now.getTime();
}

async function readClaudeKeychain(service: string): Promise<string | null> {
    // The Keychain is a macOS store. Everywhere else the honest answer is "no
    // credential here" — spawning /usr/bin/security would just fail with
    // ENOENT and take the file-credential fallback down with it.
    if (process.platform !== 'darwin') {
        return null;
    }

    try {
        const { stdout } = await execFileAsync('/usr/bin/security', [
            'find-generic-password',
            '-s',
            service,
            '-w',
        ]);

        const value = stdout.trim();
        return value.length > 0 ? value : null;
    } catch (error) {
        const exitCode = (error as { code?: number | string }).code;
        // 44 is "item not found"; ENOENT is a machine without the binary.
        if (exitCode === 44 || exitCode === '44' || exitCode === 'ENOENT') {
            return null;
        }

        throw error;
    }
}

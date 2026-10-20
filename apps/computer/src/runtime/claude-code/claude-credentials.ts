import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import * as z from 'zod';

const execFileAsync = promisify(execFile);

/** Credential variables Claude Code reads, in the order the harness forwarded them. */
export const CLAUDE_CREDENTIAL_ENV = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
] as const;

const tokenUrl = 'https://platform.claude.com/v1/oauth/token';
const clientId = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const keychainService = 'Claude Code-credentials';
const refreshWindowMs = 5 * 60_000;

const oauthSchema = z.object({
    accessToken: z.string().min(1),
    expiresAt: z.number(),
    refreshToken: z.string().min(1),
});
const storeSchema = z.looseObject({ claudeAiOauth: z.looseObject(oauthSchema.shape) });
const refreshSchema = z.object({
    access_token: z.string().min(1),
    expires_in: z.number().nonnegative(),
    refresh_token: z.string().min(1).optional(),
});

export interface CredentialSources {
    /** The Computer's env: an explicit Anthropic credential wins over the host login. */
    env: Readonly<Record<string, string | undefined>>;
    fetch?: typeof fetch;
    hostHomeDir?: string;
    now?: () => number;
    platform?: NodeJS.Platform;
    readKeychain?: () => Promise<string | undefined>;
    writeKeychain?: (value: string) => Promise<void>;
}

/**
 * Resolves the provider credential the CLI launches with, as the Claude Code harness did: an
 * explicit Anthropic credential from the Computer env, else the host's Claude subscription
 * login (credentials file, or the macOS keychain), refreshed when it expires within five
 * minutes. The Agent HOME cannot read the host keychain entry itself, so the access token rides
 * the process env. Nothing here is ever written to a Haus file.
 */
export async function resolveClaudeCredentials(
    sources: CredentialSources
): Promise<Record<string, string>> {
    const explicit = explicitCredentials(sources.env);
    if (Object.keys(explicit).length > 0) {
        return explicit;
    }
    const store = await readCredentialStore(sources);
    if (!store) {
        return {};
    }
    const now = sources.now?.() ?? Date.now();
    let { accessToken } = store.oauth;
    if (store.oauth.expiresAt <= now + refreshWindowMs) {
        const refreshed = await refreshAccessToken(store.oauth.refreshToken, sources.fetch);
        accessToken = refreshed.access_token;
        await store.write({
            ...store.value,
            claudeAiOauth: {
                ...store.value.claudeAiOauth,
                accessToken,
                expiresAt: now + refreshed.expires_in * 1000,
                refreshToken: refreshed.refresh_token ?? store.oauth.refreshToken,
            },
        });
    }
    return {
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        CLAUDE_CODE_OAUTH_TOKEN: accessToken,
    };
}

function explicitCredentials(env: CredentialSources['env']): Record<string, string> {
    const credentials: Record<string, string> = {};
    for (const key of CLAUDE_CREDENTIAL_ENV) {
        const value = env[key];
        if (value) {
            credentials[key] = value;
        }
    }
    if (Object.keys(credentials).length > 0 && env.ANTHROPIC_BASE_URL) {
        credentials.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL;
    }
    return credentials;
}

interface CredentialStore {
    oauth: z.infer<typeof oauthSchema>;
    value: z.infer<typeof storeSchema>;
    write(value: z.infer<typeof storeSchema>): Promise<void>;
}

async function readCredentialStore(sources: CredentialSources): Promise<CredentialStore | null> {
    const hostHome = sources.hostHomeDir ?? homedir();
    const configDir = resolve(sources.env.CLAUDE_CONFIG_DIR ?? join(hostHome, '.claude'));
    const credentialPath = join(configDir, '.credentials.json');
    const fileStore = parseStore(await readOptional(credentialPath));
    if (fileStore) {
        return { ...fileStore, write: (value) => writeCredentialFile(credentialPath, value) };
    }
    const platform = sources.platform ?? process.platform;
    // Claude Code keys the keychain entry by config dir; only the default dir uses this name.
    if (platform !== 'darwin' || configDir !== resolve(join(hostHome, '.claude'))) {
        return null;
    }
    const account = sources.env.USER ?? '';
    const keychainStore = parseStore(
        await (sources.readKeychain ?? (() => readKeychain(account)))()
    );
    if (!keychainStore) {
        return null;
    }
    const write = sources.writeKeychain ?? ((value: string) => writeKeychain(account, value));
    return { ...keychainStore, write: (value) => write(JSON.stringify(value)) };
}

function parseStore(text: string | undefined): Omit<CredentialStore, 'write'> | null {
    if (!text) {
        return null;
    }
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return null;
    }
    const parsed = storeSchema.safeParse(json);
    const oauth = parsed.success ? oauthSchema.safeParse(parsed.data.claudeAiOauth) : null;
    return parsed.success && oauth?.success ? { oauth: oauth.data, value: parsed.data } : null;
}

async function refreshAccessToken(refreshToken: string, fetchImpl: typeof fetch = fetch) {
    const response = await fetchImpl(tokenUrl, {
        body: JSON.stringify({
            client_id: clientId,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`Claude OAuth access token refresh failed with status ${response.status}.`);
    }
    const parsed = refreshSchema.safeParse(await response.json());
    if (!parsed.success) {
        throw new Error('Claude OAuth access token refresh returned an unexpected body.');
    }
    return parsed.data;
}

async function readOptional(path: string): Promise<string | undefined> {
    try {
        return await readFile(path, 'utf8');
    } catch (error) {
        if (isNodeCode(error, 'ENOENT')) {
            return;
        }
        throw error;
    }
}

async function writeCredentialFile(path: string, value: unknown) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, path);
}

async function readKeychain(account: string): Promise<string | undefined> {
    try {
        const { stdout } = await execFileAsync('/usr/bin/security', [
            'find-generic-password',
            '-s',
            keychainService,
            '-a',
            account,
            '-w',
        ]);
        return stdout.trim() || undefined;
    } catch {
        // No entry, or the keychain refused: the CLI then reports its own login failure.
        return;
    }
}

async function writeKeychain(account: string, value: string): Promise<void> {
    await execFileAsync('/usr/bin/security', [
        'add-generic-password',
        '-U',
        '-s',
        keychainService,
        '-a',
        account,
        '-w',
        value,
    ]);
}

function isNodeCode(error: unknown, code: string) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

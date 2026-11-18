import { randomBytes } from 'node:crypto';
import { readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as z from 'zod';

/**
 * How Grok signs in. A Grok subscription login (the operator's `auth.json`, linked into the Agent
 * HOME) is handed to Grok as an `xai.api_key` credential against the CLI chat proxy, which skips
 * Grok's own several-second `grok.com` sign-in on every launch (today's harness does the same).
 */
export type GrokCredential =
    | {
          readonly env: Readonly<Record<string, string>>;
          readonly expiresAt: number;
          readonly kind: 'subscription';
      }
    | { readonly kind: 'api-key' }
    | { readonly kind: 'native' };

/** Grok Build's OAuth client; a login record's scope key ends with it. */
const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const SUBSCRIPTION_BASE_URL = 'https://cli-chat-proxy.grok.com/v1';
/**
 * A token expiring within this window is refreshed before a launch, and a live session reloads
 * in a fresh process before a turn that could outlast it (Grok cannot swap its key mid-process).
 */
export const GROK_CREDENTIAL_REFRESH_WINDOW_MS = 30 * 60_000;

const loginRecordSchema = z.looseObject({
    expires_at: z.union([z.number(), z.string()]),
    key: z.string().min(1),
    refresh_token: z.string().min(1),
});

/** Resolves the credential for a launch, refreshing a subscription token that is about to expire. */
export async function resolveGrokCredential(input: {
    env: Readonly<Record<string, string | undefined>>;
    fetch?: typeof fetch;
    grokHome: string;
    now?: number;
}): Promise<GrokCredential> {
    if (input.env.XAI_API_KEY) {
        return { kind: 'api-key' };
    }
    const authPath = join(input.grokHome, 'auth.json');
    const records = await readLogin(authPath);
    const selected = records ? selectLogin(records) : undefined;
    if (!(records && selected)) {
        return { kind: 'native' };
    }
    let { expiresAt, key } = selected.record;
    if (expiresAt <= (input.now ?? Date.now()) + GROK_CREDENTIAL_REFRESH_WINDOW_MS) {
        const refreshed = await refreshLogin(selected, input.fetch ?? fetch);
        records[selected.scope] = {
            ...(records[selected.scope] as Record<string, unknown>),
            expires_at: refreshed.expiresAt,
            key: refreshed.accessToken,
            refresh_token: refreshed.refreshToken ?? selected.record.refreshToken,
        };
        await writeLogin(authPath, records);
        expiresAt = refreshed.expiresAt;
        key = refreshed.accessToken;
    }
    return {
        env: {
            GROK_CLI_CHAT_PROXY_BASE_URL: SUBSCRIPTION_BASE_URL,
            GROK_MODELS_BASE_URL: SUBSCRIPTION_BASE_URL,
            GROK_XAI_API_BASE_URL: SUBSCRIPTION_BASE_URL,
            XAI_API_KEY: key,
        },
        expiresAt,
        kind: 'subscription',
    };
}

/** The ACP `authenticate` method this credential uses, from the methods Grok advertised. */
export function grokAuthMethod(
    credential: GrokCredential,
    advertised: readonly string[]
): string | null {
    if (credential.kind !== 'native' && advertised.includes('xai.api_key')) {
        return 'xai.api_key';
    }
    return advertised.includes('grok.com') ? 'grok.com' : null;
}

interface SelectedLogin {
    readonly issuer: string;
    readonly record: { expiresAt: number; key: string; refreshToken: string };
    readonly scope: string;
}

async function readLogin(path: string): Promise<Record<string, unknown> | null> {
    let text: string;
    try {
        text = await readFile(path, 'utf8');
    } catch (error) {
        if (isCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
    const parsed = z.record(z.string(), z.unknown()).safeParse(safeJson(text));
    return parsed.success ? parsed.data : null;
}

function selectLogin(records: Record<string, unknown>): SelectedLogin | undefined {
    for (const [scope, value] of Object.entries(records)) {
        const separator = scope.lastIndexOf('::');
        const record = loginRecordSchema.safeParse(value);
        const expiresAt = record.success ? epochMs(record.data.expires_at) : undefined;
        if (
            record.success &&
            expiresAt !== undefined &&
            separator > 0 &&
            scope.slice(separator + 2) === XAI_CLIENT_ID
        ) {
            const { key, refresh_token: refreshToken } = record.data;
            return {
                issuer: scope.slice(0, separator),
                record: { expiresAt, key, refreshToken },
                scope,
            };
        }
    }
}

const discoverySchema = z.looseObject({ token_endpoint: z.string().url() });
const tokenSchema = z.looseObject({
    access_token: z.string().min(1),
    expires_in: z.number().nonnegative().optional(),
    refresh_token: z.string().min(1).optional(),
});

async function refreshLogin(login: SelectedLogin, fetchImpl: typeof fetch) {
    const discovery = await fetchImpl(
        `${login.issuer.replace(/\/+$/u, '')}/.well-known/openid-configuration`
    );
    if (!discovery.ok) {
        throw new Error(`Grok OAuth discovery failed with status ${discovery.status}.`);
    }
    const { token_endpoint: tokenUrl } = discoverySchema.parse(await discovery.json());
    const response = await fetchImpl(tokenUrl, {
        body: new URLSearchParams({
            client_id: XAI_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: login.record.refreshToken,
        }).toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`Grok OAuth token refresh failed with status ${response.status}.`);
    }
    const token = tokenSchema.parse(await response.json());
    const expiresAt =
        token.expires_in === undefined
            ? jwtExpiry(token.access_token)
            : Date.now() + token.expires_in * 1000;
    if (expiresAt === undefined) {
        throw new Error('Grok OAuth token refresh returned no usable expiry.');
    }
    return { accessToken: token.access_token, expiresAt, refreshToken: token.refresh_token };
}

/** Writes through the Agent HOME's link to the operator's login, keeping the link intact. */
async function writeLogin(path: string, records: Record<string, unknown>) {
    const target = await realpath(path);
    const temporary = join(dirname(target), `.auth.json.${randomBytes(6).toString('hex')}.tmp`);
    await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, target);
}

function epochMs(value: number | string): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value < 1e10 ? value * 1000 : value;
    }
    const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
}

function jwtExpiry(token: string): number | undefined {
    const payload = token.split('.')[1];
    const claims = payload ? safeJson(Buffer.from(payload, 'base64url').toString('utf8')) : null;
    const exp = z.looseObject({ exp: z.number() }).safeParse(claims);
    return exp.success ? exp.data.exp * 1000 : undefined;
}

function safeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function isCode(error: unknown, code: string): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

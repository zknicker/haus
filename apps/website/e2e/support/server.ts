import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appProtocolHeaders, appProtocolVersion } from '@haus/api/app-protocol';
import { expect, type Page } from '@playwright/test';
import { createTRPCClient, httpLink } from '@trpc/client';
import type { HausRouter } from '../../../server/src/haus-api/router.ts';
import {
    e2eHumanEmail,
    e2eHumanName,
    readClerkSessionFixture,
    signInAsClerkHuman,
} from './clerk-session.ts';

export async function createTestServer(
    page: Page,
    input: { displayName: string; slug: string },
    signIn: Parameters<typeof signInAsClerkHuman>[1] = 'human'
) {
    await signInAsClerkHuman(page, signIn);
    const session = readClerkSessionFixture();
    const client = createClient(session.token);
    const created = await client.server.create.mutate(input);
    await seedHumanIdentity(client, created.id);
    completeOnboarding(session.databaseUrl, created.id);
    const server = await client.server.bySlug.query({ slug: input.slug });
    await page.goto(`/s/${input.slug}`);

    return { client, server, session };
}

/**
 * Reports the signed-in human's Clerk identity, which the App does on every
 * real sign-in. clerk-js never loads in e2e, so nothing else would, and the
 * human would stay nameless where the product reads a display name.
 */
export async function seedHumanIdentity(client: ReturnType<typeof createClient>, serverId: string) {
    await client.member.syncIdentity.mutate({
        email: e2eHumanEmail,
        name: e2eHumanName,
        serverId,
    });
}

/** Unrelated browser specs start after the mandatory first-run journey. */
export function completeOnboarding(databaseUrl: string, serverId: string) {
    runPsql(
        databaseUrl,
        `update server_onboarding set phase = 'complete', failure_code = null, failure_detail = null
         where server_id = '${serverId}'`
    );
}

export async function openChannel(page: Page, name: string) {
    await page.getByRole('row', { exact: true, name }).click();
}

/**
 * An Agent's lifecycle verbs live in one overflow menu on its profile header,
 * so every spec reaches Stop, Restart, Start fresh session, Full reset, and
 * Delete Agent the same way.
 */
export async function runAgentAction(page: Page, agentName: string, action: string) {
    await page.getByRole('button', { name: `${agentName} — Agent actions` }).click();
    const item = page.getByRole('menuitem', { exact: true, name: action });
    // Every item is inert while a lifecycle mutation is still in flight.
    await expect(item).toBeEnabled();
    await item.click();
}

export async function openSection(page: Page, name: string) {
    // Chat has no dedicated row: non-chat sidebar pages expose a back link,
    // and everywhere else the chat navigation is already the visible sidebar.
    if (name === 'Chat') {
        const back = page.getByRole('row', { exact: true, name: 'Back to chat' });
        if (await back.isVisible().catch(() => false)) {
            await back.click();
        }
        return;
    }
    await page.getByRole('row', { exact: true, name }).click();
}

export function createClient(token: string) {
    return createTRPCClient<HausRouter>({
        links: [
            httpLink({
                headers: {
                    authorization: `Bearer ${token}`,
                    [appProtocolHeaders.productVersion]: 'e2e',
                    [appProtocolHeaders.protocolVersion]: String(appProtocolVersion),
                },
                url: `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}/trpc`,
            }),
        ],
    });
}

export async function attachComputer(
    client: ReturnType<typeof createClient>,
    input: { credential: string; slug: string }
) {
    const origin = `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}`;
    const started = await fetch(new URL('/computer/login', origin), {
        body: JSON.stringify({ origin, purpose: 'setup' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!started.ok) {
        throw new Error(`Computer login failed (${started.status}).`);
    }
    const grant = (await started.json()) as { deviceCode: string; userCode: string };
    await client.computer.login.approve.mutate({ userCode: grant.userCode });
    const exchanged = await fetch(new URL('/computer/login/poll', origin), {
        body: JSON.stringify({ deviceCode: grant.deviceCode }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!exchanged.ok) {
        throw new Error(`Computer login exchange failed (${exchanged.status}).`);
    }
    const session = (await exchanged.json()) as { accessToken: string };
    const attached = await fetch(new URL('/computer/attach', origin), {
        body: JSON.stringify({
            accessToken: session.accessToken,
            credentialHash: createHash('sha256').update(input.credential).digest('hex'),
            idempotencyKey: `cak_${randomBytes(32).toString('base64url')}`,
            slug: input.slug,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!attached.ok) {
        throw new Error(`Computer attachment failed (${attached.status}).`);
    }
    const result = (await attached.json()) as {
        computerId: string;
        idempotent: boolean;
        serverId: string;
        slug: string;
    };
    const completed = await fetch(new URL('/computer/login/complete', origin), {
        body: JSON.stringify({ accessToken: session.accessToken }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!completed.ok) {
        throw new Error(`Computer login completion failed (${completed.status}).`);
    }
    return result;
}

export function runPsql(databaseUrl: string, statement: string) {
    return execFileSync(resolvePsql(), [
        databaseUrl,
        '--no-psqlrc',
        '--tuples-only',
        '--no-align',
        '--field-separator=|',
        '--command',
        statement,
    ])
        .toString()
        .trim();
}

export function assertOpaqueId(value: string | undefined): asserts value is string {
    if (!(value && /^[a-z0-9_-]+$/iu.test(value))) {
        throw new Error('The hosted messaging fixture did not resolve an opaque id.');
    }
}

function resolvePsql() {
    const roots = [
        process.env.HAUS_POSTGRES_BIN,
        '/opt/homebrew/opt/postgresql@16/bin',
        '/opt/homebrew/opt/libpq/bin',
        '/usr/local/opt/postgresql@16/bin',
        '',
    ].filter((root): root is string => root !== undefined);

    return roots.map((root) => join(root, 'psql')).find(existsSync) ?? 'psql';
}

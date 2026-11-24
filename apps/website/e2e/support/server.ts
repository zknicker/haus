import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appProtocolHeaders, appProtocolVersion } from '@haus/api/app-protocol';
import { expect, type Page } from '@playwright/test';
import { createTRPCClient, httpLink } from '@trpc/client';
import type { HausRouter } from '../../../server/src/haus-api/router.ts';
import { type E2eIdentity, signInAsAppHuman } from './app-session.ts';
import { type ServerState, serverStateFile } from './server-state.ts';

/**
 * Restarts only the Server process, like a deploy: PostgreSQL, the port, and
 * the browser AppSession survive, and App sockets reconnect. Resolves
 * once the new process answers its health route.
 */
export async function restartHausServer(timeoutMs = 40_000) {
    const before = readServerState();
    process.kill(before.harnessPid, 'SIGUSR2');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const after = readServerState();
        if (after.generation > before.generation) {
            const response = await fetch(
                `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}/healthz`
            );
            if (response.ok) {
                return after;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('The restarted Haus Server did not become healthy.');
}

function readServerState() {
    return JSON.parse(readFileSync(serverStateFile(), 'utf8')) as ServerState;
}

export async function createTestServer(
    page: Page,
    input: { displayName: string; slug: string },
    signIn: E2eIdentity = 'human'
) {
    const session = await signInAsAppHuman(page, signIn);
    const client = createClient(session.accessToken);
    const created = await client.server.create.mutate(input);
    await seedHumanIdentity(client, created.id, session.session.user.displayName ?? '');
    const server = await client.server.bySlug.query({ slug: input.slug });
    await page.goto(`/s/${input.slug}`);

    return { client, server, session };
}

/**
 * Reports the signed-in human's Haus profile on the Server membership.
 */
export async function seedHumanIdentity(
    client: ReturnType<typeof createClient>,
    serverId: string,
    name = ''
) {
    await client.member.syncIdentity.mutate({
        name,
        serverId,
    });
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
    await page.getByRole('button', { name: `${agentName} — Captain actions` }).click();
    const item = page.getByRole('menuitem', { exact: true, name: action });
    // Every item is inert while a lifecycle mutation is still in flight.
    await expect(item).toBeEnabled();
    await item.click();
}

/**
 * The Capy shell's places: Tasks, Drive and Activity are footer links, Search is
 * the header button, Settings sits in the Account menu, and Chat is the sidebar
 * itself (a Settings page leads with a back row, "← Settings").
 */
export async function openSection(page: Page, name: string) {
    if (name === 'Chat') {
        const back = page.getByRole('row', { exact: true, name: 'Back to chat' });
        if (await back.isVisible().catch(() => false)) {
            await back.click();
        }
        return;
    }
    if (name === 'Settings') {
        await openSettings(page);
        return;
    }
    await sectionLink(page, name).click();
}

/** A sidebar place: a footer link, or the header's Search button. */
export function sectionLink(page: Page, name: string) {
    if (name === 'Search') {
        return page.getByRole('button', { exact: true, name: 'Search' });
    }
    return page.getByRole('navigation', { name: 'Sections' }).getByRole('link', {
        exact: true,
        name,
    });
}

export async function openSettings(page: Page) {
    await page.getByRole('button', { exact: true, name: 'Account' }).click();
    await page.getByRole('menuitem', { exact: true, name: 'Settings' }).click();
}

/** Opens the Inbox strip's Happening now popover; `page` must already be on the Inbox. */
export async function openHappeningNow(page: Page) {
    await page.getByRole('button', { name: /running now$/u }).click();
    return page.getByRole('dialog').filter({ hasText: 'Happening now' });
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

/** A Captain's tile in the sidebar; its name leads the label, then presence and unread. */
export function captainTile(page: Page, name: string) {
    return page
        .getByRole('list', { name: 'Captains' })
        .getByRole('link', { name: new RegExp(`^${name}(,|$)`, 'u') });
}

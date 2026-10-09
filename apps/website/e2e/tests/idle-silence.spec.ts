import type { Page } from '@playwright/test';
import {
    type AppTraffic,
    describeTraffic,
    recordAppTraffic,
    type TrafficEntry,
} from '../support/app-traffic.ts';
import { createChannelAgent } from '../support/channel-agent.ts';
import { readClerkSessionFixture } from '../support/clerk-session.ts';
import { createTestServer, openChannel, openSection } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

// An App nobody touches sends nothing but its justified polls
// (.agents/skills/perf-haus-app/SKILL.md, "Idle traffic"). Each case installs
// a fake clock before load, settles, and then fast-forwards ten minutes of
// App time; every timer that would fire in that window fires. The unit-lane
// twin is apps/website/src/lib/query-polling-contract.test.ts.

/** What may cross the wire while idle, per minute of App time, and why. */
const idleAllowance: Record<string, { perMinute: number; reason: string }> = {
    'fetch GET /api/haus-release': {
        perMinute: 0.1,
        reason: 'Desktop release check, every 10 min; releases publish outside Haus Server',
    },
    'fetch GET /haus-app-build.json': {
        perMinute: 1,
        reason: 'website build check, every 60 s; deployments have no event',
    },
};

const idleMinutes = 10;

test.describe('an idle App stays silent', () => {
    test.describe.configure({ timeout: 120_000 });

    test('on a channel', async ({ page }) => {
        const traffic = await openIdleApp(page, 'idle-channel');
        await openChannel(page, 'all');
        await expect(composer(page)).toBeVisible();
        await expectIdleSilence(page, traffic);
    });

    test('on the Inbox', async ({ page }) => {
        const traffic = await openIdleApp(page, 'idle-inbox');
        await openSection(page, 'Inbox');
        await expectIdleSilence(page, traffic);
    });

    test('on an Agent profile', async ({ page }) => {
        const traffic = await openIdleApp(page, 'idle-profile', { withAgent: true });
        await page.getByRole('row', { exact: true, name: 'Orbit' }).click({ button: 'right' });
        await page.getByRole('menuitem', { exact: true, name: 'View agent profile' }).click();
        await expect(page.getByRole('heading', { exact: true, name: 'Orbit' })).toBeVisible();
        await expectIdleSilence(page, traffic);
    });

    test('through a Clerk session token rotation', async ({ page }) => {
        // Real Clerk tokens carry a session id; rotation keeps it.
        const traffic = await openIdleApp(page, 'idle-rotation', { signIn: 'human-session' });
        await openChannel(page, 'all');
        await expect(composer(page)).toBeVisible();
        await traffic.settled();
        const mark = traffic.mark();
        await page.evaluate((token) => {
            (
                window as Window & { __setE2eClerkSessionToken?: (next: string) => void }
            ).__setE2eClerkSessionToken?.(token);
        }, readClerkSessionFixture().sessionRotatedToken);
        await idleFor(page, 60_000);
        const entries = traffic.since(mark);
        // One in-place socket refresh, never a reconnect or a refetch burst.
        expect(
            count(entries, 'ws-open'),
            `A token rotation reopened the socket, restarting every stream and its recovery reads. Rotation must refresh in place (lib/haus-session-refresh.ts):\n${describeTraffic(entries)}`
        ).toBe(0);
        expect(count(entries, 'ws-call', 'session.refresh'), describeTraffic(entries)).toBe(1);
        expectWithinAllowance(
            entries.filter((entry) => !isSessionRefresh(entry)),
            1
        );
    });

    test('through hide and show', async ({ page }) => {
        const traffic = await openIdleApp(page, 'idle-hide-show');
        await openChannel(page, 'all');
        await expect(composer(page)).toBeVisible();
        await traffic.settled();
        const mark = traffic.mark();
        await setVisibility(page, 'hidden');
        await idleFor(page, 5 * 60_000);
        await setVisibility(page, 'visible');
        await idleFor(page, 60_000);
        // Showing the window rechecks the build once (refetchOnWindowFocus).
        expectWithinAllowance(traffic.since(mark), 6, 1);
    });

    test('through offline and online', async ({ page, context }, testInfo) => {
        const traffic = await openIdleApp(page, 'idle-offline');
        await openChannel(page, 'all');
        await expect(composer(page)).toBeVisible();
        await traffic.settled();
        const mark = traffic.mark();
        await context.setOffline(true);
        await idleFor(page, 5000);
        await context.setOffline(false);
        await idleFor(page, 60_000);
        const entries = traffic.since(mark);
        const dropped = count(entries, 'ws-close') > 0;
        testInfo.annotations.push({
            description: dropped ? 'dropped' : 'survived',
            type: 'socket',
        });
        if (!dropped) {
            // The socket survived: the browser's online event recovers nothing.
            expectWithinAllowance(entries, 1);
            return;
        }
        // The socket dropped: one reconnect, one start per stream, one read per
        // recovery owner (query-reconnect-recovery.ts), never a second pass.
        const report = describeTraffic(entries);
        expect(count(entries, 'ws-open'), report).toBe(1);
        expect(duplicates(entries, 'ws-subscribe'), report).toEqual([]);
        expect(duplicates(entries, 'trpc'), report).toEqual([]);
    });
});

async function openIdleApp(
    page: Page,
    slug: string,
    options: { signIn?: 'human' | 'human-session'; withAgent?: boolean } = {}
) {
    // Installed before load so every App timer runs on the fake clock.
    await page.clock.install();
    const traffic = recordAppTraffic(page);
    const { server, session } = await createTestServer(
        page,
        { displayName: slug, slug },
        options.signIn
    );
    if (options.withAgent) {
        await createChannelAgent({
            channelName: 'all',
            databaseUrl: session.databaseUrl,
            serverId: server.id,
            slug,
            token: session.token,
        });
        await page.reload();
    }
    await expect(page.getByRole('row', { exact: true, name: 'all' })).toBeVisible();
    return traffic;
}

async function expectIdleSilence(page: Page, traffic: AppTraffic) {
    await traffic.settled();
    const mark = traffic.mark();
    await idleFor(page, idleMinutes * 60_000);
    expectWithinAllowance(traffic.since(mark), idleMinutes);
}

/**
 * Advances App time in 5 s steps; each step fires every timer due in it, and
 * the short real pause lets the requests those timers send reach the wire.
 */
async function idleFor(page: Page, ms: number) {
    for (let elapsed = 0; elapsed < ms; elapsed += 5000) {
        await page.clock.fastForward(5000);
        await page.waitForTimeout(25);
    }
    await page.waitForTimeout(1500);
}

function expectWithinAllowance(entries: TrafficEntry[], minutes: number, extraChecks = 0) {
    const unexpected = entries.filter((entry) => !(key(entry) in idleAllowance));
    const over = Object.entries(idleAllowance)
        .map(([name, { perMinute, reason }]) => {
            const limit = Math.ceil(perMinute * minutes) + extraChecks;
            const seen = entries.filter((entry) => key(entry) === name).length;
            return seen > limit ? `${name}: ${seen} > ${limit} (${reason})` : null;
        })
        .filter((line) => line !== null);
    expect(
        { over, unexpected: describeTraffic(unexpected) },
        [
            `The idle App sent traffic beyond its allowlist over ${minutes} min of App time:`,
            describeTraffic(entries) || '  (nothing)',
            'Find who sends it: a refetchInterval, a timer, a focus/reconnect refetch, or a',
            'reconnect (ws-open). Replace it with a Server event, or justify it in idleAllowance',
            'and apps/website/src/lib/query-polling-contract.test.ts.',
        ].join('\n')
    ).toEqual({ over: [], unexpected: '' });
}

function composer(page: Page) {
    return page.getByRole('textbox', { name: 'Message all' });
}

function key(entry: TrafficEntry) {
    return 'procedure' in entry ? `${entry.kind} ${entry.procedure}` : entry.kind;
}

function count(entries: TrafficEntry[], kind: TrafficEntry['kind'], procedure?: string) {
    return entries.filter(
        (entry) =>
            entry.kind === kind &&
            (procedure === undefined || ('procedure' in entry && entry.procedure === procedure))
    ).length;
}

function duplicates(entries: TrafficEntry[], kind: TrafficEntry['kind']) {
    const seen = entries.filter((entry) => entry.kind === kind).map(key);
    return [...new Set(seen.filter((name, index) => seen.indexOf(name) !== index))];
}

function isSessionRefresh(entry: TrafficEntry) {
    return entry.kind === 'ws-call' && entry.procedure === 'session.refresh';
}

function setVisibility(page: Page, state: 'hidden' | 'visible') {
    return page.evaluate((next) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: next });
        Object.defineProperty(document, 'hidden', { configurable: true, value: next === 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
    }, state);
}

import type { Page } from '@playwright/test';
import {
    type AppTraffic,
    describeTraffic,
    recordAppTraffic,
    type TrafficEntry,
} from '../support/app-traffic.ts';
import { createChannelAgent } from '../support/channel-agent.ts';
import { expectBurstCoalesced, recordPosts } from '../support/realtime-burst.ts';
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

/**
 * What showing the window after more than the 3-minute focus stale window may
 * refetch (specs/realtime-events.md, "Recovery"): each active read once. The
 * per-Chat reads count once per mounted Chat view (the shown channel and the
 * one the Server route opened first, kept behind it). `chat.message` entities
 * never refetch on focus.
 */
const focusRefetchAllowance: Record<string, { max: number; reason: string }> = {
    'trpc agent.activeActivity': { max: 1, reason: 'current Agent activity snapshot' },
    'trpc agent.list': { max: 1, reason: 'the Agent roster behind the sidebar' },
    'trpc chat.engagements': { max: 2, reason: 'engaged Agents, one per mounted Chat view' },
    'trpc chat.get': { max: 2, reason: 'the Chat record, one per mounted Chat view' },
    'trpc chat.list': { max: 1, reason: 'the sidebar Chat list' },
    'trpc chat.messages': { max: 2, reason: 'one loaded transcript page per mounted Chat view' },
    'trpc computer.list': { max: 1, reason: 'Computer status behind the sidebar' },
    'trpc member.list': { max: 1, reason: 'the member directory' },
    'trpc server.bySlug': { max: 1, reason: 'the open Server' },
    'trpc server.list': { max: 1, reason: 'the Server switcher' },
    'trpc thread.listUnread': { max: 1, reason: 'the unread Threads behind the Inbox badge' },
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

    test('through hide and show', async ({ page }) => {
        const traffic = await openIdleApp(page, 'idle-hide-show');
        await openChannel(page, 'all');
        await expect(composer(page)).toBeVisible();
        await traffic.settled();

        // A quick return, inside the focus stale window, is silent.
        const quick = traffic.mark();
        await setVisibility(page, 'hidden');
        await idleFor(page, 60_000);
        await setVisibility(page, 'visible');
        await idleFor(page, 5000);
        expectWithinAllowance(traffic.since(quick), 2, 1);

        // Past the window, showing refetches each active read at most once.
        const mark = traffic.mark();
        await setVisibility(page, 'hidden');
        await idleFor(page, 5 * 60_000);
        await setVisibility(page, 'visible');
        await idleFor(page, 60_000);
        const entries = traffic.since(mark);
        const focusReads = entries.filter((entry) => key(entry) in focusRefetchAllowance);
        const report = describeTraffic(entries);
        for (const [name, { max }] of Object.entries(focusRefetchAllowance)) {
            expect(
                focusReads.filter((entry) => key(entry) === name).length,
                `${name} refetched more than once per read on focus:\n${report}`
            ).toBeLessThanOrEqual(max);
        }
        expect(count(entries, 'trpc', 'chat.message'), report).toBe(0);
        // Showing the window also rechecks the build once (refetchOnWindowFocus).
        expectWithinAllowance(
            entries.filter((entry) => !(key(entry) in focusRefetchAllowance)),
            6,
            1
        );
    });

    test('through a realtime burst', async ({ page }) => {
        const traffic = await openIdleApp(page, 'idle-burst');
        await openChannel(page, 'all');
        await expect(composer(page)).toBeVisible();
        const posts = recordPosts(page);
        await traffic.settled();
        await expectBurstCoalesced(page, traffic, posts, 'idle-burst');
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
        // The socket dropped: one reconnect, one start per stream, and each
        // read refetched at most once: the burst of starts shares one settle
        // window, and reads fetched after a start are skipped
        // (start-reconciliation.ts).
        const report = describeTraffic(entries);
        expect(count(entries, 'ws-open'), report).toBe(1);
        expect(duplicates(entries, 'ws-subscribe'), report).toEqual([]);
        expect(duplicates(entries, 'trpc'), report).toEqual([]);
    });
});

async function openIdleApp(page: Page, slug: string, options: { withAgent?: boolean } = {}) {
    // Installed before load so every App timer runs on the fake clock.
    await page.clock.install();
    const traffic = recordAppTraffic(page);
    const { server, session } = await createTestServer(page, { displayName: slug, slug });
    if (options.withAgent) {
        await createChannelAgent({
            channelName: 'all',
            databaseUrl: session.databaseUrl,
            serverId: server.id,
            slug,
            token: session.accessToken,
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

function setVisibility(page: Page, state: 'hidden' | 'visible') {
    return page.evaluate((next) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: next });
        Object.defineProperty(document, 'hidden', { configurable: true, value: next === 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
    }, state);
}

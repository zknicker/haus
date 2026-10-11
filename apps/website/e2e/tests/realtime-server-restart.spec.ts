import { type AppTraffic, describeTraffic, recordAppTraffic } from '../support/app-traffic.ts';
import {
    expectDeletedChatPurged,
    expectEventsConverge,
    expectStaleEntityReadLoses,
} from '../support/realtime-convergence.ts';
import { installRealtimeProxy } from '../support/realtime-proxy.ts';
import {
    createRealtimeScene,
    expectConverged,
    showTab,
    visibleSurface,
} from '../support/realtime-scene.ts';
import { restartHausServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

// The incident detector (specs/realtime-events.md, "App e2e: the incident
// detector"). After the 9.5.0 deploy reconnected every socket, the App's one
// Chat stream failed on resubscribe and nothing restarted it, so kept desktop
// tabs stopped hearing Agent replies, Thread summaries, and Cloud Agent rows.
// A desktop window cannot be refreshed: every change must converge with no reload.

const removedProcedures = ['chat.onEvent', 'chat.events', 'chat.eventHead', 'server.onUpdate'];

/** `chat.onMessageCreated`'s owned reads, plus the read receipt viewing the reply sends. */
const ownedReads = new Set([
    'chat.messages',
    'chat.list',
    'chat.search',
    'chat.markRead',
    // A missed Thread reply may have made a Thread unread (ADR 0043).
    'thread.listUnread',
]);

test('A: one failed stream restarts alone and recovers only its owned reads', async ({ page }) => {
    test.setTimeout(150_000);
    const proxy = await installRealtimeProxy(page);
    const traffic = recordAppTraffic(page);
    const scene = await createRealtimeScene(page, 'realtime-isolation');
    await traffic.settled();

    const stream = proxy.latest('chat.onMessageCreated');
    const work = proxy.latest('cloudAgentWork.onUpdated');
    const startsBefore = proxy.subscriptions.length;
    const mark = traffic.mark();

    // The Server ends exactly this subscription; its restart is held at the proxy.
    proxy.hold(['chat.onMessageCreated']);
    proxy.inject(stream, 'INTERNAL_SERVER_ERROR');
    await scene.changes.allReply('A reply while the stream is down', 'iso-all');
    await scene.changes.threadReply('A Thread reply while the stream is down', 'iso-thread');
    const computer = await scene.changes.workUpdate('Rebuilding the index while down');
    // A sibling keeps its id and delivers while the failed stream is down.
    await expect.poll(() => proxy.deliveredTo(work).length, { timeout: 15_000 }).toBeGreaterThan(0);
    // The App restarted the failed stream (held at the proxy), and only it.
    await expect
        .poll(() => proxy.subscriptions.slice(startsBefore).map((s) => s.path), {
            timeout: 15_000,
        })
        .toEqual(['chat.onMessageCreated']);

    const released = traffic.mark();
    proxy.release();
    await expect(visibleSurface(page).getByText('A reply while the stream is down')).toBeVisible({
        timeout: 15_000,
    });
    await traffic.settled();
    const recovery = traffic.since(released);
    expect(
        recovery.filter((entry) => entry.kind === 'trpc' && !ownedReads.has(entry.procedure)),
        `Recovery read more than its owned reads:\n${describeTraffic(recovery)}`
    ).toEqual([]);
    expect(recovery).toContainEqual({ kind: 'trpc', procedure: 'chat.messages' });
    expect(proxy.subscriptions.slice(startsBefore).map((s) => s.path)).toEqual([
        'chat.onMessageCreated',
    ]);

    await expectConverged(page, scene, {
        activity: 'Rebuilding the index while down',
        allReply: 'A reply while the stream is down',
        threadReply: 'A Thread reply while the stream is down',
    });
    expect(
        traffic.since(mark).filter((entry) => entry.kind === 'ws-open'),
        'The stream recovered by reconnecting the socket, not by restarting itself'
    ).toEqual([]);
    expectNoRemovedProcedures(traffic);
    computer.close();
});

test('A2: an Agent reply into a kept tab recovers through the message stream alone', async ({
    page,
}) => {
    test.setTimeout(150_000);
    const proxy = await installRealtimeProxy(page);
    const traffic = recordAppTraffic(page);
    const scene = await createRealtimeScene(page, 'realtime-agent');
    // Show the `#product` tab, so a reveal can never be what refetches it.
    await showTab(page, 'product');
    await traffic.settled();

    const stream = proxy.latest('chat.onMessageCreated');
    const lifecycle = proxy.latest('agent.onLifecycle');
    const startsBefore = proxy.subscriptions.length;
    proxy.hold(['chat.onMessageCreated']);
    proxy.inject(stream, 'INTERNAL_SERVER_ERROR');
    const down = traffic.mark();
    await scene.changes.agentReply('An Agent reply while the stream is down', 'agent-down');
    // The Agent's `sending` notice arrives on the live lifecycle stream...
    await expect
        .poll(
            () =>
                proxy
                    .deliveredTo(lifecycle)
                    .some((event) => (event as { phase?: string }).phase === 'sending'),
            { timeout: 15_000 }
        )
        .toBe(true);
    // ...and reads no transcript: lifecycle streams own activity only.
    await traffic.settled();
    expect(
        traffic
            .since(down)
            .filter((entry) => entry.kind === 'trpc' && entry.procedure === 'chat.messages'),
        `A lifecycle notice read transcripts:\n${describeTraffic(traffic.since(down))}`
    ).toEqual([]);

    const released = traffic.mark();
    proxy.release();
    await expect
        .poll(() => traffic.since(released).filter((entry) => entry.kind === 'trpc'), {
            timeout: 15_000,
        })
        .toContainEqual({ kind: 'trpc', procedure: 'chat.messages' });
    await traffic.settled();
    const recovery = traffic.since(released);
    expect(
        recovery.filter((entry) => entry.kind === 'trpc' && !ownedReads.has(entry.procedure)),
        `Recovery read more than its owned reads:\n${describeTraffic(recovery)}`
    ).toEqual([]);
    expect(proxy.subscriptions.slice(startsBefore).map((s) => s.path)).toEqual([
        'chat.onMessageCreated',
    ]);

    // The shown kept tab converges with no reveal, focus, or reload.
    await expect(
        visibleSurface(page).getByText('An Agent reply while the stream is down')
    ).toBeVisible({ timeout: 15_000 });
    expectNoRemovedProcedures(traffic);
});

test('B: a Server restart with refused resubscribes converges, then C and D', async ({ page }) => {
    test.setTimeout(180_000);
    const proxy = await installRealtimeProxy(page);
    const traffic = recordAppTraffic(page);
    const scene = await createRealtimeScene(page, 'realtime-restart');
    await traffic.settled();
    const socketsBefore = proxy.socketCount();
    const startsBefore = proxy.subscriptions.length;

    // Every start on the new socket waits at the proxy until the changes commit,
    // and the first two `chat.onMessageCreated` starts are refused.
    proxy.hold('all');
    proxy.refuse('chat.onMessageCreated', ['UNAUTHORIZED', 'FORBIDDEN']);
    const mark = traffic.mark();
    await restartHausServer();
    await expect
        .poll(() => proxy.subscriptions.slice(startsBefore).length, { timeout: 30_000 })
        .toBeGreaterThan(0);
    // Whatever the App reads on reconnect settles before anything commits,
    // while every subscription start stays held: those reads now predate the
    // changes, so only start reconciliation can converge them.
    await traffic.settled();
    const committing = traffic.mark();
    await scene.changes.allReply('A reply after the deploy', 'restart-all');
    await scene.changes.threadReply('A Thread reply after the deploy', 'restart-thread');
    const computer = await scene.changes.workUpdate('Rebuilding the index after the deploy');
    await traffic.settled();
    expect(
        traffic.since(committing).filter((entry) => entry.kind === 'trpc'),
        'A read after the commits would converge without start reconciliation'
    ).toEqual([]);
    await expect(visibleSurface(page).getByText('A reply after the deploy')).toHaveCount(0);
    proxy.release();

    await expect(visibleSurface(page).getByText('A reply after the deploy')).toBeVisible({
        timeout: 30_000,
    });
    await traffic.settled();
    const reconnect = traffic.since(mark);
    expect(
        reconnect.filter((entry) => entry.kind === 'trpc' && entry.procedure === 'chat.message'),
        `Start reconciliation read entities:\n${describeTraffic(reconnect)}`
    ).toEqual([]);
    // The session refreshed once in place; the App neither signed out nor cleared the Server.
    expect(
        proxy.socketCalls.filter(
            (call) => call.socket >= socketsBefore && call.path === 'session.refresh'
        )
    ).toHaveLength(1);
    await expect(page.getByRole('row', { exact: true, name: 'all' })).toBeVisible();
    // Each stream resubscribed once on the new socket; only the refused one
    // retried. Sibling starts own the transcript lists too, so the reply can
    // land before the refused stream's third start; wait for it.
    await expect
        .poll(
            () =>
                proxy.subscriptions.filter(
                    (s) => s.socket >= socketsBefore && s.path === 'chat.onMessageCreated'
                ).length,
            { timeout: 15_000 }
        )
        .toBe(3);
    const starts = new Map<string, number>();
    for (const start of proxy.subscriptions.filter((s) => s.socket >= socketsBefore)) {
        const key = `${start.path} ${start.input}`;
        starts.set(key, (starts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of starts) {
        expect(count, key).toBe(key.startsWith('chat.onMessageCreated ') ? 3 : 1);
    }
    // The Server-level streams resubscribed too, so a rename after the deploy propagates.
    for (const path of ['server.onUpdated', 'member.onUpdated']) {
        expect(
            [...starts.keys()].some((key) => key.startsWith(`${path} `)),
            path
        ).toBe(true);
    }
    const renamed = traffic.mark();
    await scene.client.server.rename.mutate({
        displayName: 'Realtime restart renamed',
        serverId: scene.server.id,
    });
    await expect
        .poll(() => proxy.deliveredTo(proxy.latest('server.onUpdated')).length, {
            timeout: 15_000,
        })
        .toBeGreaterThan(0);
    await expect
        .poll(() => traffic.since(renamed), { timeout: 15_000 })
        .toContainEqual({ kind: 'trpc', procedure: 'server.bySlug' });

    await expectConverged(page, scene, {
        activity: 'Rebuilding the index after the deploy',
        allReply: 'A reply after the deploy',
        threadReply: 'A Thread reply after the deploy',
    });
    computer.close();

    await expectStaleEntityReadLoses(page, scene);
    await expectEventsConverge(page, scene, proxy);
    await expectDeletedChatPurged(page, scene);
    expectNoRemovedProcedures(traffic);
});

function expectNoRemovedProcedures(traffic: AppTraffic) {
    const procedures = traffic
        .since(0)
        .flatMap((entry) => ('procedure' in entry ? [entry.procedure] : []));
    for (const removed of removedProcedures) {
        expect(procedures).not.toContain(removed);
    }
}

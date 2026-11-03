import type { Page } from '@playwright/test';
import { createAppTestFixture } from './app-session.ts';
import { type AppTraffic, describeTraffic } from './app-traffic.ts';
import { createClient } from './server.ts';
import { expect } from './test.ts';

/** Freezes App time (frames and timers) so a whole burst lands before one frame. */
async function freezeAppTime(page: Page) {
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(new Date(now + 1));
}

/**
 * Waits real time for a burst's events to arrive while App time stays frozen,
 * then runs one frame (the coalescer's flush), lets its requests settle, and
 * resumes App time.
 */
async function flushOneFrame(page: Page) {
    await page.waitForTimeout(1000);
    await page.clock.runFor(20);
    await page.waitForTimeout(500);
    await page.clock.runFor(5000);
    await page.waitForTimeout(1500);
    await page.clock.resume();
}

/** Every tRPC HTTP request (one per POST, however many procedures it batches). */
export function recordPosts(page: Page) {
    const posts: string[][] = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/trpc/')) {
            posts.push(url.pathname.slice('/trpc/'.length).split(',').map(decodeURIComponent));
        }
    });
    return posts;
}

/**
 * The idle-silence burst case (specs/realtime-events.md, "Perf gates"): a
 * message + read + follow burst refetches `chat.list` once per frame; entity
 * invalidations in one tick share one batched POST; and task or label events
 * with no mounted task view request nothing. The App runs on Playwright's fake
 * clock, so every event of the burst lands before the one frame that flushes it.
 */
export async function expectBurstCoalesced(
    page: Page,
    traffic: AppTraffic,
    posts: string[][],
    slug: string
) {
    const device = createClient((await createAppTestFixture()).accessToken);
    const server = await device.server.bySlug.query({ slug });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id ?? '';
    const send = (content: string, thread?: { anchorMessageId: string }) =>
        device.chat.send.mutate({
            chatId,
            content,
            nonce: `${slug}-${content}`,
            serverId: server.id,
            ...(thread ? { thread } : {}),
        });
    const anchor = await send('Burst anchor');
    const other = await send('Burst neighbor');
    await expect(page.getByText('Burst neighbor')).toBeVisible();
    await page.clock.fastForward(5000);
    await traffic.settled();
    const mark = traffic.mark();

    // Burst 1: a Thread reply (message + follow) and a read; one frame flushes it.
    await freezeAppTime(page);
    await send('Burst reply', { anchorMessageId: anchor.message.id });
    await device.chat.markRead.mutate({
        chatId,
        sequence: other.message.sequence,
        serverId: server.id,
    });
    await flushOneFrame(page);
    const first = traffic.since(mark);
    expect(
        first.filter((entry) => entry.kind === 'trpc' && entry.procedure === 'chat.list').length,
        describeTraffic(first)
    ).toBeLessThanOrEqual(1);

    // Burst 2, with no list read in flight: two reactions and a label edit.
    await traffic.settled();
    const second = traffic.mark();
    const postsBefore = posts.length;
    await freezeAppTime(page);
    for (const message of [anchor.message, other.message]) {
        await device.chat.react.mutate({ emoji: '👀', messageId: message.id, serverId: server.id });
    }
    await device.taskLabel.create.mutate({ name: 'Burst label', serverId: server.id });
    await flushOneFrame(page);
    const entries = traffic.since(second);
    const report = describeTraffic(entries);
    const reads = (procedure: string) =>
        entries.filter((entry) => entry.kind === 'trpc' && entry.procedure === procedure).length;
    // No mounted task view: task and label events request nothing.
    expect(reads('task.list'), report).toBe(0);
    expect(reads('taskLabel.list'), report).toBe(0);
    // Both entity invalidations of the frame share one batched POST (beside the
    // label edit's list refetch, which carries no entity read).
    const entityPosts = posts.slice(postsBefore).filter((post) => post.includes('chat.message'));
    expect(entityPosts, report).toHaveLength(1);
    expect(entityPosts[0]?.filter((procedure) => procedure === 'chat.message')).toHaveLength(2);
}

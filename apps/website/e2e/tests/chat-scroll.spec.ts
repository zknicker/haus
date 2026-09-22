import type { Locator } from '@playwright/test';
import { assertOpaqueId, createTestServer, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('human sends jump to latest; agent messages preserve following across background and settings', async ({
    page,
}) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
        const NativeResizeObserver = window.ResizeObserver;
        const pending = new Map<ResizeObserver, () => void>();
        // Hidden Chromium windows can defer resize delivery while JS timers still run.
        window.ResizeObserver = class extends NativeResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                super((entries, observer) => {
                    if (document.visibilityState === 'hidden') {
                        pending.set(observer, () => callback(entries, observer));
                    } else {
                        callback(entries, observer);
                    }
                });
            }
            disconnect() {
                pending.delete(this);
                super.disconnect();
            }
        };
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                requestAnimationFrame(() => {
                    for (const callback of pending.values()) {
                        callback();
                    }
                    pending.clear();
                });
            }
        });
    });
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Chat scrolling',
        slug: 'chat-scrolling',
    });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
    assertOpaqueId(chatId);
    for (let index = 0; index < 24; index += 1) {
        await client.chat.send.mutate({
            chatId,
            serverId: server.id,
            nonce: `scroll-history-${index}`,
            content: `History ${index}\n\nA paragraph that gives this conversation enough height to scroll.`,
        });
    }
    const sendAgent = await agentSender();
    await openChannel(page, 'all');
    const viewport = page.locator('[data-slot="message-scroller-viewport"]');
    await atBottom(viewport);
    await scrollUp(viewport);
    const composer = page.getByRole('textbox', { name: 'Message all' });
    await composer.fill('My send returns to the bottom');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await atBottom(viewport);
    await expect(page.getByText('My send returns to the bottom', { exact: true })).toBeInViewport();

    await sendAgent('Agent while following');
    await expect(page.getByText('Agent while following', { exact: true })).toBeInViewport();
    await atBottom(viewport);

    // Exercise the lifecycle events explicitly: headless Chromium keeps tabs visible.
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('blur'));
    });
    await sendAgent('Agent while backgrounded');
    await expect(page.getByText('Agent while backgrounded', { exact: true })).toBeAttached();
    // The viewport can change while hidden, before its queued resize callback runs.
    await page.setViewportSize({ width: 1280, height: 480 });
    await expect(viewport).not.toHaveAttribute('data-autoscrolling');
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
    });
    await atBottom(viewport);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(viewport).toHaveCount(0);
    await sendAgent('Agent while in settings');
    await page.getByRole('row', { name: 'Back to chat', exact: true }).click();
    await expect(page.getByText('Agent while in settings', { exact: true })).toBeAttached();
    await atBottom(viewport);

    await scrollUp(viewport);
    const readingTop = await viewport.evaluate((element) => element.scrollTop);
    await sendAgent('Agent while reading history');
    await expect(page.getByText('Agent while reading history', { exact: true })).toBeAttached();
    await expect
        .poll(() => viewport.evaluate((element) => element.scrollTop))
        .toBeCloseTo(readingTop, 0);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await sendAgent('Agent while backgrounded and reading history');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect
        .poll(() => viewport.evaluate((element) => element.scrollTop))
        .toBeCloseTo(readingTop, 0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('row', { name: 'Back to chat', exact: true }).click();
    await expect.poll(() => distanceFromEnd(viewport)).toBeGreaterThan(300);

    async function agentSender() {
        const userId = runPsql(
            session.databaseUrl,
            "select id from users where clerk_user_id = 'user_e2e_human'"
        );
        assertOpaqueId(userId);
        const credentialHash = 'c'.repeat(64);
        const inventory = {
            runtimes: [
                { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] },
            ],
        };
        runPsql(
            session.databaseUrl,
            `insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
            values ('cmp_scrolltest000000', '${server.id}', '${userId}', '${credentialHash}', '${JSON.stringify(inventory)}'::jsonb, 'healthy')`
        );
        const { agent } = await client.agent.create.mutate({
            computerId: 'cmp_scrolltest000000',
            displayName: 'Scroll agent',
            handle: 'scroll-agent',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: server.id,
        });
        const origin = `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}`;
        const minted = await fetch(`${origin}/computer/runner/mint`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                agentId: agent.id,
                chatId,
                credentialHash,
                runId: 'run_scrolltest000000',
            }),
        });
        expect(minted.ok).toBe(true);
        const payload: unknown = await minted.json();
        if (
            !(
                payload &&
                typeof payload === 'object' &&
                'runnerToken' in payload &&
                typeof payload.runnerToken === 'string'
            )
        ) {
            throw new Error('Missing scroll test runner token');
        }
        return async (content: string) => {
            // The deterministic runner has consumed history before composing its reply.
            runPsql(
                session.databaseUrl,
                `insert into agent_inbox_cursors
                (server_id, agent_id, session_generation, chat_id, seen_up_to_sequence)
                select '${server.id}', '${agent.id}', agent.session_generation, chat.id, chat.last_message_sequence
                from agents agent, chats chat where agent.id = '${agent.id}' and chat.id = '${chatId}'
                on conflict (server_id, agent_id, session_generation, chat_id)
                do update set seen_up_to_sequence = excluded.seen_up_to_sequence`
            );
            const response = await fetch(`${origin}/api/agent/messages/send`, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${payload.runnerToken}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ content, nonce: crypto.randomUUID(), target: '#all' }),
            });
            expect(await response.json()).toMatchObject({ state: 'sent' });
            expect(response.ok).toBe(true);
        };
    }
});

async function distanceFromEnd(viewport: Locator) {
    return await viewport.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop
    );
}

async function atBottom(viewport: Locator) {
    await expect.poll(() => distanceFromEnd(viewport)).toBeLessThanOrEqual(8);
}

async function scrollUp(viewport: Locator) {
    await viewport.hover();
    await viewport.page().mouse.wheel(0, -700);
    await expect.poll(() => distanceFromEnd(viewport)).toBeGreaterThan(300);
}

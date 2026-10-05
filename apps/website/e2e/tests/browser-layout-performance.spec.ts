import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('desktop browser ignores unrelated DOM updates and still covers overlapping overlays', async ({
    page,
}, testInfo) => {
    await installDesktopBrowserStub(page);
    const { client, server } = await createTestServer(page, {
        displayName: 'Browser performance',
        slug: 'browser-performance',
    });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(chatId);
    await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        nonce: 'browser-performance-link',
        content: '[Example](https://example.com)',
    });
    await openChannel(page, 'all');
    await page.getByRole('link', { name: 'Open Example', exact: true }).click();
    await expect(
        page.getByRole('region', { name: 'Browser: example.com', exact: true })
    ).toBeVisible();
    await expect
        .poll(() =>
            page.evaluate(
                () => (Reflect.get(window, '__browserLayout') as unknown[] | undefined)?.length ?? 0
            )
        )
        .toBe(1);

    const measurements = await page.evaluate(async () => {
        const host = document.querySelector(
            'section[aria-label="Browser: example.com"] > div:last-child'
        );
        if (!(host instanceof HTMLElement)) {
            throw new Error('Browser host missing');
        }
        const noise = document.createElement('div');
        noise.style.cssText = 'position:fixed;left:-10000px;top:0';
        document.body.append(noise);
        for (let index = 0; index < 4; index += 1) {
            await new Promise(requestAnimationFrame);
        }
        const original = host.getBoundingClientRect;
        let count = 0;
        host.getBoundingClientRect = () => {
            count += 1;
            return original.call(host);
        };
        try {
            for (let index = 0; index < 20; index += 1) {
                noise.append(document.createElement('span'));
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
            }
            return count;
        } finally {
            host.getBoundingClientRect = original;
            noise.remove();
        }
    });
    await testInfo.attach('layout-measurements', {
        body: JSON.stringify({ unrelatedUpdates: 20, measurements }),
        contentType: 'application/json',
    });
    expect(measurements).toBe(0);

    await page.evaluate(() => {
        const dialog = document.createElement('div');
        dialog.id = 'performance-overlay';
        dialog.role = 'dialog';
        dialog.style.cssText = 'position:fixed;inset:0;z-index:9999';
        document.body.append(dialog);
    });
    await expect
        .poll(() =>
            page.evaluate(
                () => (Reflect.get(window, '__browserLayout') as unknown[] | undefined)?.length ?? 0
            )
        )
        .toBe(0);
    await page.evaluate(() => document.getElementById('performance-overlay')?.remove());
    await expect
        .poll(() =>
            page.evaluate(
                () => (Reflect.get(window, '__browserLayout') as unknown[] | undefined)?.length ?? 0
            )
        )
        .toBe(1);
});

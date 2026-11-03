import { assertOpaqueId, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Amazon chips resolve prose and links, preview on focus, and turn back into text and links after disconnect', async ({
    page,
    context,
}) => {
    test.setTimeout(60_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Amazon references',
        slug: 'amazon-references',
    });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
    assertOpaqueId(chatId);
    const connection = await client.mcp.addPresetAccount.mutate({
        serverId: server.id,
        preset: 'rankwrangler',
        name: 'RankWrangler',
    });
    assertOpaqueId(connection.id);
    runPsql(
        session.databaseUrl,
        `update mcp_connections set connected = true, tools = ARRAY['rankwrangler_product'] where id = '${connection.id}'`
    );
    const summary = {
        asin: 'B07XN9T11R',
        marketplaceId: 'ATVPDKIKX0DER',
        shortName: 'Freaky Lunch Lady' as string | null,
        title: 'Freaky Lunch Lady Shirt',
        brand: 'Lunch Lady Designs',
        thumbnail: { status: 'available', url: 'https://images.example.com/original.svg' },
        cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.svg' },
        amazonListingStatus: 'active',
    };
    let originalImageRequests = 0;
    await page.route('https://images.example.com/**', async (route) => {
        if (route.request().url().endsWith('/original.svg')) {
            originalImageRequests += 1;
        }
        await route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><circle cx="48" cy="48" r="32" fill="black"/></svg>',
        });
    });
    let detailCalls = 0;
    const slowAsin = 'B0DDZPDF14';
    let releaseSlow: () => void = () => undefined;
    const slowReleased = new Promise<void>((resolve) => {
        releaseSlow = resolve;
    });
    await page.route('**/trpc/mcp.amazonProduct*', async (route) => {
        const path = new URL(route.request().url()).pathname.split('/trpc/')[1];
        const input = route.request().postDataJSON() as { asin: string };
        if (path === 'mcp.amazonProduct') {
            if (input.asin === slowAsin) {
                await slowReleased;
                await route.fulfill({
                    json: {
                        result: {
                            data: {
                                status: 'found',
                                product: { ...summary, asin: slowAsin, shortName: 'Slow Shirt' },
                            },
                        },
                    },
                });
                return;
            }
            await route.fulfill({
                json: { result: { data: { status: 'found', product: summary } } },
            });
            return;
        }
        detailCalls += 1;
        await route.fulfill({
            json: {
                result: {
                    data: {
                        ...summary,
                        price: { amountMinor: 1999, currencyCode: 'USD' },
                        bulletPoints: ['Soft fabric', 'Classic fit'],
                    },
                },
            },
        });
    });
    await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        nonce: 'amazon-preview',
        content:
            'Compare **B07XN9T11R** with [the listing](https://www.amazon.com/dp/B07XN9T11R) and B0DDZPDF14.\n\nKeep `B07XN9T11R` as code.',
    });
    await page.goto(`/s/amazon-references/chats/${chatId}`);
    const chips = page.getByRole('link', { name: 'Open Freaky Lunch Lady on Amazon' });
    await expect(chips).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByRole('link', { name: `Open ${slowAsin} on Amazon` })).toHaveCount(1, {
        timeout: 15_000,
    });
    releaseSlow();
    await expect(page.getByRole('link', { name: 'Open Slow Shirt on Amazon' })).toHaveCount(1);
    await expect(page.locator('code').filter({ hasText: 'B07XN9T11R' })).toBeVisible();
    expect(detailCalls).toBe(0);
    expect(originalImageRequests).toBe(0);
    await expect(chips.first().locator('img')).toHaveAttribute('src', summary.cutoutThumbnail.url);
    await expect(chips.first().locator('svg')).toHaveCount(0);
    await expect(chips.first().locator('img')).toHaveCSS('width', '18px');
    await expect(chips.first()).toHaveText('Freaky Lunch Lady');
    const card = page.getByRole('tooltip');
    await expect(async () => {
        await page.mouse.move(0, 0);
        await chips.first().hover();
        await expect(card).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await expect(card.getByText('Freaky Lunch Lady Shirt')).toBeVisible();
    await expect(card.getByText('Lunch Lady Designs')).toBeVisible();
    await expect(card.getByText('$19.99')).toBeVisible();
    const asin = card.locator('code').filter({ hasText: 'B07XN9T11R' });
    await expect(asin).toBeVisible();
    await expect(asin).toHaveClass(/font-mono/);
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(card.locator('img')).toHaveAttribute('src', summary.cutoutThumbnail.url);
    const chipBox = await chips.first().boundingBox();
    if (!chipBox) {
        throw new Error('The product chip has no box.');
    }
    const cardLeft = async () => (await card.boundingBox())?.x ?? Number.NaN;
    const midY = chipBox.y + chipBox.height / 2;
    await page.mouse.move(chipBox.x + 8, midY);
    const before = await cardLeft();
    await page.mouse.move(chipBox.x + 48, midY);
    await expect.poll(cardLeft).toBeCloseTo(before + 40, 0);
    await page.evaluate(() => navigator.clipboard.writeText('not-the-asin'));
    await chips.first().click({ button: 'right' });
    await expect(card).toBeHidden();
    await page.getByRole('menuitem', { name: 'Copy ASIN' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('B07XN9T11R');
    await page.mouse.move(0, 0);
    await expect(card).toBeHidden();
    await chips.first().focus();
    await page.keyboard.press('Tab');
    await expect(chips.last()).toBeFocused();
    await expect(card).toBeVisible();
    await expect(card.getByText('Soft fabric')).toHaveCount(0);
    expect(detailCalls).toBe(1);
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    summary.shortName = null;
    await page.reload();
    const fallbackChips = page.getByRole('link', { name: 'Open B07XN9T11R on Amazon' });
    await expect(fallbackChips).toHaveCount(2, { timeout: 15_000 });
    await client.mcp.disconnect.mutate({ serverId: server.id, connectionId: connection.id });
    await expect(fallbackChips).toHaveCount(0);
    await expect(page.locator('strong').filter({ hasText: /^B07XN9T11R$/u })).toBeVisible();
    await expect(page.getByText(`and ${slowAsin}.`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the listing' })).toHaveAttribute(
        'href',
        'https://www.amazon.com/dp/B07XN9T11R'
    );
});

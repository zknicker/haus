import { assertOpaqueId, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Amazon chips resolve prose and links, preview on focus, and fall back after disconnect', async ({
    page,
}) => {
    test.setTimeout(60_000);
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
    await page.route('**/trpc/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const paths = url.pathname.split('/trpc/')[1]?.split(',') ?? [];
        if (!paths.some((path) => path.startsWith('mcp.amazonProduct'))) {
            await route.continue();
            return;
        }
        const inputs = request.postDataJSON();
        const results = await Promise.all(
            paths.map(async (path, index) => {
                if (path === 'mcp.amazonProducts') {
                    return { result: { data: [summary] } };
                }
                if (path === 'mcp.amazonProductDetail') {
                    detailCalls += 1;
                    return {
                        result: {
                            data: {
                                ...summary,
                                price: { amountMinor: 1999, currencyCode: 'USD' },
                                bulletPoints: ['Soft fabric', 'Classic fit'],
                            },
                        },
                    };
                }
                const response = await page.request.post(`${url.origin}/trpc/${path}?batch=1`, {
                    headers: request.headers(),
                    data: { 0: inputs[index] },
                });
                return (await response.json())[0];
            })
        );
        await route.fulfill({ json: results });
    });
    await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        nonce: 'amazon-preview',
        content:
            'Compare **B07XN9T11R** with [the listing](https://www.amazon.com/dp/B07XN9T11R).\n\nKeep `B07XN9T11R` as code.',
    });
    await page.goto(`/s/amazon-references/chats/${chatId}`);
    const chips = page.getByRole('link', { name: 'Open Freaky Lunch Lady on Amazon' });
    await expect(chips).toHaveCount(2);
    await expect(page.locator('code').filter({ hasText: 'B07XN9T11R' })).toBeVisible();
    expect(detailCalls).toBe(0);
    expect(originalImageRequests).toBe(0);
    await expect(chips.first().locator('img')).toHaveAttribute('src', summary.cutoutThumbnail.url);
    await expect(chips.first().locator('svg')).toHaveCount(0);
    await expect(chips.first().locator('img')).toHaveCSS('width', '18px');
    await expect(chips.first()).toHaveText('Freaky Lunch Lady');
    await expect(async () => {
        await page.mouse.move(0, 0);
        await chips.first().hover();
        await expect(page.getByRole('tooltip').getByText('$19.99')).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await expect(page.getByRole('tooltip').getByText('Freaky Lunch Lady Shirt')).toBeVisible();
    await expect(page.getByRole('tooltip').getByText('Lunch Lady Designs')).toBeVisible();
    await expect(page.getByRole('tooltip').locator('img')).toHaveAttribute(
        'src',
        summary.cutoutThumbnail.url
    );
    const triggerBounds = await chips.first().boundingBox();
    if (!triggerBounds) {
        throw new Error('Product chip has no bounds');
    }
    const pointer = { x: triggerBounds.x + 12, y: triggerBounds.y + 8 };
    await page.mouse.move(pointer.x, pointer.y);
    await expect(async () => {
        const bounds = await page.getByRole('tooltip').boundingBox();
        expect(bounds).not.toBeNull();
        expect(Math.abs(bounds!.x - (pointer.x + 15))).toBeLessThan(2);
        expect(Math.abs(bounds!.y + bounds!.height - (pointer.y - 15))).toBeLessThan(2);
    }).toPass();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toHaveCSS('pointer-events', 'none');
    const previewBounds = await tooltip.boundingBox();
    if (!previewBounds) {
        throw new Error('Product tooltip has no bounds');
    }
    await page.mouse.move(previewBounds.x + 20, previewBounds.y + previewBounds.height - 5);
    await expect(tooltip).toBeHidden();
    await page.mouse.move(0, 0);
    await chips.last().focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('tooltip').getByText('Soft fabric')).toHaveCount(0);
    expect(detailCalls).toBe(1);
    summary.shortName = null;
    await page.reload();
    const fallbackChips = page.getByRole('link', { name: 'Open B07XN9T11R on Amazon' });
    await expect(fallbackChips).toHaveCount(2);
    await client.mcp.disconnect.mutate({ serverId: server.id, connectionId: connection.id });
    await expect(chips).toHaveCount(0);
    await expect(fallbackChips).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open the listing' })).toBeVisible();
});

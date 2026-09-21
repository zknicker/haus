import { createTestServer, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';
import { visualReportMessage } from '../support/visual-report.ts';

test('inline reports track the reply column and grow and shrink with their document', async ({
    page,
}) => {
    const { server, session } = await createTestServer(page, {
        displayName: 'Visual Reports',
        slug: 'visual-reports',
    });
    const chat = server.channels.find((channel) => channel.name === 'all');
    if (!chat) {
        throw new Error('Missing all channel');
    }
    runPsql(
        session.databaseUrl,
        `
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values ('agt_visual_reports', '${server.id}', 'reporter', 'Reporter', 'UTC');
        insert into chat_messages (id, server_id, chat_id, sequence, author_agent_id, content, nonce)
        values ('msg_visual_report', '${server.id}', '${chat.id}', 1, 'agt_visual_reports',
        '${visualReportMessage.replaceAll("'", "''")}', 'visual-report');
        update chats set last_message_sequence = 1 where id = '${chat.id}';
    `
    );
    await openChannel(page, 'all');
    const frame = page.locator('iframe[title="Responsive sales report"]');
    const report = page.frameLocator('iframe[title="Responsive sales report"]');
    await expect(frame).toBeVisible();
    const assertHeight = async () => {
        await expect
            .poll(async () => {
                const bodyHeight = await report
                    .locator('body')
                    .evaluate((body) => body.offsetHeight);
                const frameHeight = await frame.evaluate((element) => element.clientHeight);
                return Math.abs(frameHeight - bodyHeight);
            })
            .toBeLessThanOrEqual(1);
    };
    // No shell, so no border to subtract: the frame is the reply column itself,
    // capped at the prose measure (max-w-[46rem]).
    const proseMeasure = 736;
    const rowsByViewport = new Map<number, number>();
    for (const width of [1440, 400, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await assertHeight();
        const geometry = await frame.evaluate((element) => ({
            frame: element.getBoundingClientRect().width,
            message: element.closest('.chat-reply-segments')?.getBoundingClientRect().width,
        }));
        expect(geometry.frame).toBeCloseTo(Math.min(geometry.message ?? 0, proseMeasure), 0);
        const rows = await report
            .locator('.kpis article')
            .evaluateAll(
                (cards) => new Set(cards.map((card) => card.getBoundingClientRect().top)).size
            );
        rowsByViewport.set(width, rows);
    }
    // The document reflows inside the frame: at 1440 the frame is the 736px
    // cap, at 400 it is the narrower column, so the same five tiles take more
    // rows. Exact counts would pin the sidebar's default width as well.
    expect(rowsByViewport.get(1440)).toBeLessThan(rowsByViewport.get(400) ?? 0);
    await report.getByRole('button', { name: 'Tall report', exact: true }).click();
    await assertHeight();
    await expect
        .poll(() => frame.evaluate((element) => element.clientHeight))
        .toBeGreaterThan(2200);
    const shortHeight = (await frame.evaluate((element) => element.clientHeight)) - 2160;
    await report.getByRole('button', { name: 'Short report', exact: true }).click();
    await assertHeight();
    await expect.poll(() => frame.evaluate((element) => element.clientHeight)).toBe(shortHeight);
    await expect(page.getByRole('button', { name: 'Show all', exact: true })).toHaveCount(0);
    const overflow = await report.locator('[data-haus-table-scroll]').evaluate((element) => ({
        x: element.scrollWidth > element.clientWidth,
        y: element.scrollHeight > element.clientHeight,
    }));
    expect(overflow).toEqual({ x: true, y: false });
    const viewport = page.locator('[data-slot="message-scroller-viewport"]');
    await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    // A report growing while the reader follows the bottom keeps the bottom visible.
    await report.locator('#details').evaluate((element) => {
        element.style.height = '2200px';
    });
    await expect
        .poll(() => frame.evaluate((element) => element.clientHeight))
        .toBeGreaterThan(2200);
    await expect
        .poll(() =>
            viewport.evaluate((element) =>
                Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop)
            )
        )
        .toBeLessThanOrEqual(2);
    await report.locator('#details').evaluate((element) => {
        element.style.height = '40px';
    });
    await expect.poll(() => frame.evaluate((element) => element.clientHeight)).toBe(shortHeight);
    await expect
        .poll(() =>
            viewport.evaluate((element) =>
                Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop)
            )
        )
        .toBeLessThanOrEqual(2);
    const height = await frame.evaluate((element) => element.clientHeight);
    await page.evaluate(() => window.postMessage({ type: 'haus-visual-size', height: 9999 }, '*'));
    await expect(frame).toHaveCSS('height', `${height}px`);
    await report.locator('body').evaluate(() => {
        for (const height of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, '9000']) {
            parent.postMessage({ type: 'haus-visual-size', height }, '*');
        }
    });
    await expect(frame).toHaveCSS('height', `${height}px`);
});

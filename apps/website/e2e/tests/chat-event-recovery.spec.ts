import type { Page } from '@playwright/test';
import { recordAppTraffic } from '../support/app-traffic.ts';
import { createChannelAgent } from '../support/channel-agent.ts';
import { installDesktopBrowserStub, openDesktopWindow } from '../support/desktop-browser-stub.ts';
import { createTestServer, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

// The 9.5.0 incident: an Agent's reply never reached an open desktop tab whose
// window kept other chats alive, because one chat.onEvent error left the stream
// dead for good. A desktop window cannot be refreshed, so every message here
// must arrive on the visible surface with no reload.

test('an Agent reply reaches the shown desktop tab, also after the event stream fails once', async ({
    page,
}) => {
    test.setTimeout(120_000);
    await installDesktopBrowserStub(page);
    const traffic = recordAppTraffic(page);
    const slug = 'chat-event-recovery';
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Chat event recovery',
        slug,
    });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug,
        token: session.token,
    });
    for (const name of ['design', 'ops']) {
        await client.chat.createChannel.mutate({
            agentIds: [agent.agentId],
            name,
            serverId: server.id,
        });
    }
    await openDesktopWindow(page, `/s/${slug}`);
    // #ops and #all become kept views behind #design.
    for (const channel of ['ops', 'all', 'design']) {
        await openChannel(page, channel);
        await expect(composer(page, channel)).toBeVisible();
    }
    const tabs = page
        .getByRole('navigation', { exact: true, name: 'Tabs' })
        .locator('.workspace-tab');
    await page.getByRole('row', { exact: true, name: 'all' }).click({ modifiers: ['Meta'] });
    await expect(tabs).toHaveCount(2);
    await tabs.nth(1).getByRole('button', { exact: true, name: 'all' }).click();
    await expect(composer(page, 'all')).toBeVisible();

    await agent.send('Orbit answers the shown tab', 'recovery-shown');
    await expect(visibleSurface(page).getByText('Orbit answers the shown tab')).toBeVisible();

    // A reply landing while its tab is in the background shows on reveal.
    await tabs.nth(0).getByRole('button', { exact: true, name: 'design' }).click();
    await expect(composer(page, 'design')).toBeVisible();
    await agent.send('Orbit answers a background tab', 'recovery-background');
    await tabs.nth(1).getByRole('button', { exact: true, name: 'all' }).click();
    await expect(visibleSurface(page).getByText('Orbit answers a background tab')).toBeVisible();

    // Force exactly one Server-side chat.onEvent error, with no test-only code:
    // the Server rechecks membership before each delivery, so a revocation
    // that lasts across one event ends the stream. Membership is back before
    // the App's first restart (1 s), so the restart succeeds and catches up.
    const mark = traffic.mark();
    const revoke = (revokedAt: string) =>
        runPsql(
            session.databaseUrl,
            `update server_memberships set revoked_at = ${revokedAt}
             where server_id = '${server.id}' and user_id = '${agent.ownerUserId}'`
        );
    revoke('now()');
    await agent.send('Orbit answers while the stream fails', 'recovery-failed');
    await page.waitForTimeout(300);
    revoke('null');

    await expect(
        visibleSurface(page).getByText('Orbit answers while the stream fails')
    ).toBeVisible({ timeout: 15_000 });
    const entries = traffic.since(mark);
    expect(
        entries.filter((entry) => entry.kind === 'ws-open'),
        'The stream recovered by reconnecting the socket, not by restarting itself'
    ).toEqual([]);
    expect(entries).toContainEqual({ kind: 'ws-subscribe', procedure: 'chat.onEvent' });
    expect(entries).toContainEqual({ kind: 'trpc', procedure: 'chat.events' });

    // The restarted stream delivers live again.
    await agent.send('Orbit answers after recovery', 'recovery-after');
    await expect(visibleSurface(page).getByText('Orbit answers after recovery')).toBeVisible();
});

function composer(page: Page, channel: string) {
    return page.getByRole('textbox', { name: `Message ${channel}` });
}

function visibleSurface(page: Page) {
    return page.locator('[data-slot="chat-surface"]').filter({ visible: true });
}

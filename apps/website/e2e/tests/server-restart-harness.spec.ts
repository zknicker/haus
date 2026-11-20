import { recordAppTraffic } from '../support/app-traffic.ts';
import { createTestServer, restartHausServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

// Smoke for the restart control the realtime incident spec builds on: the
// Server child restarts, the port and session survive, and the App's socket
// reconnects to the new process without a reload.
test('the App reconnects to a restarted Server', async ({ page }) => {
    const traffic = recordAppTraffic(page);
    const { client } = await createTestServer(page, {
        displayName: 'Restart Smoke',
        slug: 'restart-smoke',
    });
    await expect(page.getByRole('row', { exact: true, name: 'all' })).toBeVisible();
    await traffic.settled();
    const mark = traffic.mark();

    const first = await restartHausServer();
    const second = await restartHausServer();
    // Repeated restarts work, each with a fresh process.
    expect(second.generation).toBe(first.generation + 1);
    expect(second.serverPid).not.toBe(first.serverPid);

    await expect
        .poll(() => traffic.since(mark).filter((entry) => entry.kind === 'ws-open').length, {
            timeout: 30_000,
        })
        .toBeGreaterThan(0);
    await expect(client.server.bySlug.query({ slug: 'restart-smoke' })).resolves.toMatchObject({
        slug: 'restart-smoke',
    });
    await expect(page.getByRole('row', { exact: true, name: 'all' })).toBeVisible();
});

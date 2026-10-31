import { defineConfig } from '@playwright/test';

const runId = process.env.HAUS_E2E_RUN_ID ?? 'default';
const hausServerPort = Number.parseInt(process.env.HAUS_SERVER_PORT ?? '8091', 10);
const websitePort = Number.parseInt(process.env.HAUS_WEBSITE_PORT ?? '3101', 10);

export default defineConfig({
    fullyParallel: false,
    reporter: 'list',
    testDir: process.env.HAUS_E2E_TEST_DIR ?? './e2e/tests',
    use: {
        baseURL: `http://127.0.0.1:${websitePort}`,
        trace: 'retain-on-failure',
    },
    webServer: buildWebServers(),
    workers: 1,
});

function buildWebServers() {
    return [
        {
            // Browser E2E exercises the current hosted product boundary. Real
            // Computer/model turns live in the opt-in Agent E2E lane.
            command: `HAUS_E2E_RUN_ID=${runId} HAUS_SERVER_PORT=${hausServerPort} HAUS_APP_ORIGIN=http://127.0.0.1:${websitePort} exec bun e2e/start-haus-server.ts`,
            // Let the process stop its throwaway PostgreSQL cluster and remove
            // its data directory instead of being killed outright.
            gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
            reuseExistingServer: false,
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 30_000,
            url: `http://127.0.0.1:${hausServerPort}/healthz`,
        },
        {
            // The test mode accepts only an in-memory AppSession injected by
            // the Playwright test runner on this loopback origin.
            command: `VITE_HAUS_SERVER_ORIGIN=http://127.0.0.1:${hausServerPort} HAUS_WEBSITE_PORT=${websitePort} bun run dev -- --host 127.0.0.1 --port ${websitePort} --mode test`,
            reuseExistingServer: false,
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 30_000,
            url: `http://127.0.0.1:${websitePort}`,
        },
    ];
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { resolveDevPorts } from '../../../scripts/dev-ports.mjs';
import { agentE2eAuthStatePath } from './global-setup.ts';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const ports = resolveDevPorts({ repositoryRoot });

export default defineConfig({
    expect: {
        timeout: 30_000,
    },
    fullyParallel: false,
    globalSetup: './global-setup.ts',
    outputDir: '../../../.context/agent-e2e/results',
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: '../../../.context/agent-e2e/report' }],
    ],
    retries: 0,
    testDir: './tests',
    timeout: 360_000,
    use: {
        baseURL: `http://localhost:${ports.websitePort}`,
        screenshot: 'only-on-failure',
        storageState: agentE2eAuthStatePath,
        trace: 'retain-on-failure',
    },
    workers: 1,
});

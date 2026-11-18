import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { resolveDevPorts } from '../../../scripts/dev-ports.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
export const agentE2eAuthStatePath = path.join(
    repositoryRoot,
    '.context',
    'agent-e2e',
    'auth.json'
);

export default async function globalSetup() {
    const ports = resolveDevPorts({ repositoryRoot });
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(`http://localhost:${ports.websitePort}/`);
        await page.waitForURL(/\/s\/[^/]+(?:\/|$)/u, { timeout: 60_000 });
        await mkdir(path.dirname(agentE2eAuthStatePath), { recursive: true });
        await context.storageState({ path: agentE2eAuthStatePath });
    } finally {
        await browser.close();
    }
}

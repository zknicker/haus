import { expect, test } from 'bun:test';
import type { CloudAgentModel } from '@haus/api';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import {
    cloudAgentModelCatalogMaxAgeMs,
    expireCloudAgentModelCatalogs,
    readCloudAgentModelCatalog,
    startCloudAgentModelCatalogRefresh,
} from './model-catalog.ts';
import type { CloudAgentModelListing, CloudAgentReadiness } from './provider.ts';

const nano: CloudAgentModelListing = { displayName: 'GPT-5.4 Nano', id: 'gpt-5.4-nano' };
const opus: CloudAgentModelListing = {
    description: ' Frontier ',
    displayName: 'Claude Opus',
    id: 'opus',
};
const mappedNano: CloudAgentModel = {
    description: null,
    displayName: 'GPT-5.4 Nano',
    effort: null,
    family: 'gpt',
    fast: null,
    id: 'gpt-5.4-nano',
    order: 0,
};

function connected(expiresAt: string): CloudAgentReadiness {
    return { account: { email: 'delegate@example.com', expiresAt }, ready: true };
}

function countingProvider(models: () => Promise<CloudAgentModelListing[]>) {
    const provider = createFakeCloudAgentProvider();
    let reads = 0;
    provider.listModels = () => {
        reads += 1;
        return models();
    };
    return { provider, reads: () => reads };
}

test('the catalog is read once per account per day, then re-read when stale or expired', async () => {
    const { provider, reads } = countingProvider(() => Promise.resolve([nano, opus]));
    const readiness = connected('2026-12-01T00:00:00.000Z');
    const start = new Date('2026-10-02T12:00:00.000Z');

    const first = await readCloudAgentModelCatalog(provider, readiness, () => start);
    expect(first).toEqual({
        autoAvailable: false,
        models: [
            mappedNano,
            {
                ...mappedNano,
                description: 'Frontier',
                displayName: 'Claude Opus',
                family: 'claude',
                id: 'opus',
                order: 1,
            },
        ],
        refreshedAt: start.toISOString(),
    });
    await readCloudAgentModelCatalog(provider, readiness, () => new Date(start.getTime() + 1000));
    expect(reads()).toBe(1);

    const later = new Date(start.getTime() + cloudAgentModelCatalogMaxAgeMs);
    expect((await readCloudAgentModelCatalog(provider, readiness, () => later))?.refreshedAt).toBe(
        later.toISOString()
    );
    expect(reads()).toBe(2);

    expireCloudAgentModelCatalogs();
    await readCloudAgentModelCatalog(provider, readiness, () => later);
    expect(reads()).toBe(3);
});

test('a reconnect re-reads the catalog and a disconnect reports none', async () => {
    const { provider, reads } = countingProvider(() => Promise.resolve([nano]));
    await readCloudAgentModelCatalog(provider, connected('2026-12-01T00:00:00.000Z'));
    await readCloudAgentModelCatalog(provider, connected('2027-01-01T00:00:00.000Z'));
    expect(reads()).toBe(2);
    expect(
        await readCloudAgentModelCatalog(provider, { ready: false, reason: 'not-connected' })
    ).toBeNull();
});

test('a failed read keeps the last good catalog for the same account, and none for a new one', async () => {
    let fail = false;
    const { provider } = countingProvider(() =>
        fail ? Promise.reject(new Error('rate limited')) : Promise.resolve([nano, nano])
    );
    const readiness = connected('2026-12-01T00:00:00.000Z');
    const good = await readCloudAgentModelCatalog(provider, readiness);
    expect(good?.models).toEqual([mappedNano]);

    fail = true;
    expireCloudAgentModelCatalogs();
    expect(await readCloudAgentModelCatalog(provider, readiness)).toEqual(good);
    expect(
        await readCloudAgentModelCatalog(provider, connected('2027-01-01T00:00:00.000Z'))
    ).toBeNull();
});

test('the daily refresh starts once per connection and re-reads before reporting', async () => {
    const { provider, reads } = countingProvider(() => Promise.resolve([nano]));
    const readiness = connected('2026-12-01T00:00:00.000Z');
    await readCloudAgentModelCatalog(provider, readiness);
    const loops: Array<() => Promise<void>> = [];
    const work = {
        startLoop(_interval: unknown, operation: (signal: AbortSignal) => Promise<void>) {
            loops.push(() => operation(new AbortController().signal));
        },
    };
    let reports = 0;
    const report = async () => {
        reports += 1;
        await readCloudAgentModelCatalog(provider, readiness);
    };
    startCloudAgentModelCatalogRefresh(work, report);
    startCloudAgentModelCatalogRefresh(work, report);
    expect(loops).toHaveLength(1);

    await loops[0]?.();
    expect(reports).toBe(1);
    expect(reads()).toBe(2);
});

import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import {
    appendReleaseDraft,
    assertReleaseLedger,
    createReleaseDraft,
    formatReleaseTargets,
    latestProductVersion,
    releaseTargetBuildNumber,
    releaseTargetVersion,
} from './release-ledger.mjs';

const normalRelease = {
    version: '1.2.3',
    date: '2026-08-01',
    targets: {
        server: '1.2.3',
        app: '1.2.3',
        ios: { version: '2.0.0', buildNumber: 7 },
        computer: '3.0.0',
    },
};

test('migrated ledger is oldest-first and keeps independent target versions', async () => {
    const ledger = JSON.parse(await readFile('releases.json', 'utf8'));
    const product = JSON.parse(await readFile('packages/haus-api/haus-product.json', 'utf8'));
    const result = assertReleaseLedger(ledger, { requireComplete: true });

    expect(ledger.length).toBeGreaterThanOrEqual(34);
    expect(ledger[0]).toEqual({
        version: '1.6.7',
        date: '2026-07-28',
        targets: { server: '1.6.7', app: '1.6.7', ios: null, computer: '1.1.1' },
    });
    expect(ledger.find((entry) => entry.version === '1.8.24')).toEqual({
        version: '1.8.24',
        date: '2026-08-26',
        targets: {
            server: '1.8.24',
            app: null,
            ios: { version: '1.0.4', buildNumber: 5 },
            computer: '1.4.8',
        },
    });
    expect(ledger.find((entry) => entry.date === '2026-08-18')).toMatchObject({
        version: '1.8.18',
        targets: { ios: { version: '1.0.0', buildNumber: 1 } },
    });
    expect(result.latest).toBe(ledger.at(-1));
    expect(latestProductVersion(ledger)).toBe(product.version);
    expect(ledger.filter((entry) => entry.version === null)).toHaveLength(2);
});

test('allows historical versionless records but rejects a versionless latest release', () => {
    const historical = {
        version: null,
        date: '2026-08-01',
        targets: { server: null, app: null, ios: null, computer: '3.0.0' },
    };

    expect(
        assertReleaseLedger([historical, normalRelease], { requireComplete: true }).complete
    ).toBe(true);
    expect(() =>
        assertReleaseLedger([normalRelease, historical], { requireComplete: true })
    ).toThrow('release ledger Haus version must be SemVer');
});

test('validates component-only releases under monotonic public Haus versions', () => {
    const ledger = [
        normalRelease,
        {
            version: '1.2.4',
            date: '2026-08-02',
            targets: { server: null, app: null, ios: null, computer: '3.0.1' },
        },
    ];

    expect(assertReleaseLedger(ledger, { requireComplete: true }).complete).toBe(true);
    expect(latestProductVersion(ledger)).toBe('1.2.4');
    expect(releaseTargetVersion(ledger[0], 'ios')).toBe('2.0.0');
    expect(releaseTargetBuildNumber(ledger[0])).toBe(7);
});

test('requires every release target key', () => {
    const incomplete = {
        ...normalRelease,
        targets: { server: '1.2.3', app: '1.2.3', computer: '3.0.0' },
    };

    expect(() => assertReleaseLedger([incomplete], { requireComplete: true })).toThrow(
        'release ledger targets must contain exactly Server, App, iOS, Computer, and Haus Agent'
    );
});

test('allows undecided targets only in the latest draft', () => {
    const draft = createReleaseDraft('1.2.4');
    const result = assertReleaseLedger([normalRelease, draft]);

    expect(result.complete).toBe(false);
    expect(() => assertReleaseLedger([draft, normalRelease])).toThrow(
        'only the latest release ledger entry may be a draft'
    );
    expect(formatReleaseTargets(draft)).toContain('- App: Undecided');
});

test('appends one higher Haus draft without rewriting history', () => {
    const ledger = appendReleaseDraft([normalRelease], '1.2.4');

    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toBe(normalRelease);
    expect(ledger[1]).toEqual(createReleaseDraft('1.2.4'));
    expect(() => appendReleaseDraft(ledger, '1.2.5')).toThrow(
        'latest release ledger entry is still a draft'
    );
});

test('Haus Agent versions increase and publish through Server and Computer', () => {
    const first = {
        ...normalRelease,
        targets: { ...normalRelease.targets, agent: '1.0.0' },
    };
    const second = {
        version: '1.2.4',
        date: '2026-08-02',
        targets: {
            server: '1.2.4',
            app: null,
            ios: null,
            computer: '3.0.1',
            agent: '1.0.1',
        },
    };

    expect(assertReleaseLedger([first, second], { requireComplete: true }).complete).toBe(true);
    expect(() =>
        assertReleaseLedger([first, { ...second, targets: { ...second.targets, agent: '1.0.0' } }])
    ).toThrow('Haus Agent versions must be oldest-first');
    expect(() =>
        assertReleaseLedger([first, { ...second, targets: { ...second.targets, computer: null } }])
    ).toThrow('Haus Agent publication requires Server and Computer publication');
});

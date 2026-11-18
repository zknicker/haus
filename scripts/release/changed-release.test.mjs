import { expect, test } from 'bun:test';
import { detectChangedRelease } from './changed-release.mjs';
import { createReleaseDraft } from './release-ledger.mjs';

const beforeSha = 'a'.repeat(40);
const afterSha = 'b'.repeat(40);
const baseRelease = {
    version: '1.8.23',
    date: '2026-08-26',
    targets: { server: '1.8.23', app: null, ios: null, computer: null },
};

test('initial ledger migration publishes nothing', async () => {
    const plan = await detectChangedRelease({
        before: beforeSha,
        after: afterSha,
        readLedger: async (ref) => (ref === beforeSha ? null : [baseRelease]),
    });

    expect(plan).toEqual({
        initialLedgerMigration: true,
        targets: {
            computer: false,
            agent: false,
            app: false,
            ios: false,
            server: false,
        },
    });
});

test('one appended release returns its target publication plan', async () => {
    const appended = {
        version: '1.8.24',
        date: '2026-08-27',
        targets: {
            server: '1.8.24',
            app: '1.8.24',
            ios: { version: '1.0.4', buildNumber: 5 },
            computer: '1.4.8',
            agent: '1.0.0',
        },
    };

    const plan = await detectChangedRelease({
        before: beforeSha,
        after: afterSha,
        readLedger: async (ref) => (ref === beforeSha ? [baseRelease] : [baseRelease, appended]),
    });

    expect(JSON.stringify(plan)).toBe(
        '{"initialLedgerMigration":false,"targets":{"computer":true,"agent":true,"app":true,"ios":true,"server":true}}'
    );
});

test('a Computer-only component release still carries a public Haus version', async () => {
    const appended = {
        version: '1.8.24',
        date: '2026-08-27',
        targets: { server: null, app: null, ios: null, computer: '1.4.8', agent: null },
    };
    const plan = await detectChangedRelease({
        before: beforeSha,
        after: afterSha,
        readLedger: async (ref) => (ref === beforeSha ? [baseRelease] : [baseRelease, appended]),
    });

    expect(plan.targets).toEqual({
        computer: true,
        agent: false,
        app: false,
        ios: false,
        server: false,
    });
});

test('an appended draft does not publish undecided targets', async () => {
    const plan = await detectChangedRelease({
        before: beforeSha,
        after: afterSha,
        readLedger: async (ref) =>
            ref === beforeSha ? [baseRelease] : [baseRelease, createReleaseDraft('1.8.24')],
    });

    expect(plan.initialLedgerMigration).toBe(false);
    expect(Object.values(plan.targets).every((target) => target === false)).toBe(true);
});

test('a newly appended entry cannot use the historical four-target shape', async () => {
    const appended = {
        version: '1.8.24',
        date: '2026-08-27',
        targets: { server: '1.8.24', app: null, ios: null, computer: null },
    };

    await expect(
        detectChangedRelease({
            before: beforeSha,
            after: afterSha,
            readLedger: async (ref) =>
                ref === beforeSha ? [baseRelease] : [baseRelease, appended],
        })
    ).rejects.toThrow('new release ledger entries must include the Haus Agent target');
});

test('history edits fail even when the entry count is unchanged', async () => {
    const edited = {
        ...baseRelease,
        targets: { server: '1.8.23', app: '1.8.23', ios: null, computer: null },
    };

    await expect(
        detectChangedRelease({
            before: beforeSha,
            after: afterSha,
            readLedger: async (ref) => (ref === beforeSha ? [baseRelease] : [edited]),
        })
    ).rejects.toThrow('release ledger history was edited');
});

test('multiple appended entries fail', async () => {
    const first = {
        version: '1.8.24',
        date: '2026-08-27',
        targets: { server: '1.8.24', app: null, ios: null, computer: null, agent: null },
    };
    const second = {
        version: '1.8.25',
        date: '2026-08-28',
        targets: { server: '1.8.25', app: null, ios: null, computer: null, agent: null },
    };

    await expect(
        detectChangedRelease({
            before: beforeSha,
            after: afterSha,
            readLedger: async (ref) =>
                ref === beforeSha ? [baseRelease] : [baseRelease, first, second],
        })
    ).rejects.toThrow('release ledger has multiple appended entries');
});

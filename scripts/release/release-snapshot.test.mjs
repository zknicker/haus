import { expect, test } from 'bun:test';
import {
    assertPublicHausSnapshot,
    hausSnapshotKeys,
    parsePublicHausSnapshot,
    resolveExpectedPublicHausRelease,
    resolveReleaseSnapshot,
} from './release-snapshot.mjs';

const sourceRevision = 'a'.repeat(40);

test('resolves a product release into its carried-forward component snapshot', () => {
    const ledger = [
        {
            version: '1.8.38',
            date: '2026-08-27',
            targets: {
                agent: '1.0.0',
                app: '1.8.22',
                computer: '1.4.8',
                ios: { buildNumber: 6, version: '1.0.5' },
                server: '1.8.38',
            },
        },
        {
            version: '1.9.0',
            date: '2026-08-28',
            targets: {
                agent: null,
                app: null,
                computer: '1.4.9',
                ios: null,
                server: null,
            },
        },
    ];

    expect(resolveReleaseSnapshot(ledger, { sourceRevision })).toEqual({
        components: {
            agent: '1.0.0',
            computer: '1.4.9',
            desktopApp: '1.8.22',
            ios: { buildNumber: 6, version: '1.0.5' },
            server: '1.8.38',
        },
        date: '2026-08-28',
        schemaVersion: 1,
        sourceRevision,
        version: '1.9.0',
    });
});

test('preserves null for a component that has never published', () => {
    const ledger = [
        {
            version: '1.0.0',
            date: '2026-08-28',
            targets: { agent: null, app: null, computer: '1.0.0', ios: null, server: null },
        },
    ];

    expect(resolveReleaseSnapshot(ledger, { sourceRevision }).components).toEqual({
        agent: null,
        computer: '1.0.0',
        desktopApp: null,
        ios: null,
        server: null,
    });
});

test('resolves one expected object only for the current public release version', () => {
    const ledger = [
        {
            version: '1.9.0',
            date: '2026-08-28',
            targets: { agent: null, app: null, computer: '1.4.9', ios: null, server: '1.8.38' },
        },
    ];

    expect(resolveExpectedPublicHausRelease(ledger, { sourceRevision, version: '1.9.0' })).toEqual(
        resolveReleaseSnapshot(ledger, { sourceRevision })
    );
    expect(() =>
        resolveExpectedPublicHausRelease(ledger, { sourceRevision, version: 'latest' })
    ).toThrow('must be X.Y.Z');
    expect(() =>
        resolveExpectedPublicHausRelease(ledger, { sourceRevision, version: '1.8.0' })
    ).toThrow('does not match latest release 1.9.0');
});

test('requires a complete release and exact source identity', () => {
    const release = {
        version: '1.0.0',
        date: null,
        targets: {
            agent: 'undecided',
            app: 'undecided',
            computer: 'undecided',
            ios: 'undecided',
            server: 'undecided',
        },
    };
    expect(() => resolveReleaseSnapshot([release], { sourceRevision })).toThrow(
        'latest release ledger entry is still a draft'
    );
    expect(() =>
        resolveReleaseSnapshot(
            [
                {
                    ...release,
                    date: '2026-08-28',
                    targets: {
                        ...release.targets,
                        agent: null,
                        app: null,
                        computer: '1.0.0',
                        ios: null,
                        server: null,
                    },
                },
            ],
            { sourceRevision: 'abc' }
        )
    ).toThrow('full lowercase Git SHA');
});

test('owns stable public snapshot keys and validates the complete payload shape', () => {
    const snapshot = {
        components: {
            agent: '1.0.0',
            computer: '1.4.9',
            desktopApp: '1.8.22',
            ios: { buildNumber: 6, version: '1.0.5' },
            server: '1.8.38',
        },
        date: '2026-08-28',
        schemaVersion: 1,
        sourceRevision,
        version: '1.9.0',
    };

    expect(hausSnapshotKeys(snapshot.version)).toEqual({
        immutable: 'haus/1.9.0.json',
        latest: 'haus/latest.json',
    });
    expect(parsePublicHausSnapshot(snapshot)).toBe(snapshot);
    expect(assertPublicHausSnapshot(snapshot, snapshot, 'snapshot')).toBeUndefined();
});

test('rejects a public snapshot with missing or extra fields', () => {
    const snapshot = {
        components: { agent: null, computer: null, desktopApp: null, ios: null, server: null },
        date: '2026-08-28',
        schemaVersion: 1,
        sourceRevision,
        version: '1.9.0',
    };

    expect(() => parsePublicHausSnapshot({ ...snapshot, extra: true })).toThrow(
        'has unexpected fields'
    );
    const missingVersion = Object.fromEntries(
        Object.entries(snapshot).filter(([key]) => key !== 'version')
    );
    expect(() => parsePublicHausSnapshot(missingVersion)).toThrow('has unexpected fields');
});

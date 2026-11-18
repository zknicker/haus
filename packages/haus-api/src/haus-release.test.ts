import { expect, test } from 'bun:test';
import { hausReleaseSnapshotSchema } from './haus-release.ts';

const snapshot = {
    components: {
        agent: null,
        computer: '1.4.9',
        desktopApp: '1.8.22',
        ios: { buildNumber: 6, version: '1.0.5' },
        server: '1.8.38',
    },
    date: '2026-08-28',
    schemaVersion: 1,
    sourceRevision: 'a'.repeat(40),
    version: '1.9.0',
} as const;

test('accepts a complete Haus release snapshot with independently versioned components', () => {
    expect(hausReleaseSnapshotSchema.parse(snapshot)).toEqual(snapshot);
});

test('allows unavailable legacy component identities without weakening release identity', () => {
    expect(
        hausReleaseSnapshotSchema.parse({
            ...snapshot,
            components: { ...snapshot.components, ios: null },
        }).components.ios
    ).toBeNull();
    expect(() => hausReleaseSnapshotSchema.parse({ ...snapshot, version: '1.9' })).toThrow();
    expect(() => hausReleaseSnapshotSchema.parse({ ...snapshot, sourceRevision: 'abc' })).toThrow();
});

test('rejects ambiguous or invalid component metadata', () => {
    expect(() =>
        hausReleaseSnapshotSchema.parse({
            ...snapshot,
            components: {
                ...snapshot.components,
                ios: { buildNumber: 0, version: '1.0.5' },
            },
        })
    ).toThrow();
    expect(() => hausReleaseSnapshotSchema.parse({ ...snapshot, extra: true })).toThrow();
});

import { expect, test } from 'bun:test';
import type { ArtifactMetadata } from '@haus/api';
import { groupArtifactsByDate } from './artifact-date-groups.ts';

const artifact = (id: string, updated_at: string) =>
    ({ artifact_id: id, updated_at }) as ArtifactMetadata;

// Monday, Oct 12 2026, 10:00 in New York.
const now = Date.parse('2026-10-12T14:00:00Z');

test('groups by Today, Yesterday, weekday, day this month, month this year, then year', () => {
    const groups = groupArtifactsByDate(
        [
            artifact('a', '2026-10-12T13:00:00Z'),
            artifact('b', '2026-10-12T04:30:00Z'),
            artifact('c', '2026-10-11T15:00:00Z'),
            artifact('d', '2026-10-08T15:00:00Z'),
            artifact('e', '2026-10-03T15:00:00Z'),
            artifact('f', '2026-09-20T15:00:00Z'),
            artifact('g', '2026-09-02T15:00:00Z'),
            artifact('h', '2025-12-31T15:00:00Z'),
        ],
        now,
        'America/New_York'
    );
    expect(
        groups.map((group) => [group.label, group.artifacts.map((item) => item.artifact_id)])
    ).toEqual([
        ['Today', ['a', 'b']],
        ['Yesterday', ['c']],
        ['Thursday', ['d']],
        ['Oct 3', ['e']],
        ['September', ['f', 'g']],
        ['2025', ['h']],
    ]);
});

test('day boundaries follow the viewer zone, not UTC', () => {
    // 02:00 UTC on Oct 12 is still Oct 11 in New York.
    const late = [artifact('late', '2026-10-12T02:00:00Z')];
    expect(groupArtifactsByDate(late, now, 'America/New_York')[0]?.label).toBe('Yesterday');
    expect(groupArtifactsByDate(late, now, 'UTC')[0]?.label).toBe('Today');
});

test('a clock running ahead of the Server still reads as Today', () => {
    const ahead = [artifact('ahead', '2026-10-13T01:00:00Z')];
    expect(groupArtifactsByDate(ahead, now, 'UTC')[0]?.label).toBe('Today');
});

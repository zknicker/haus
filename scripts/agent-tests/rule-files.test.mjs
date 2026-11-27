import { expect, test } from 'bun:test';
import { sentencesOf, standingPreferences } from './rule-files.mjs';

test('counts sentences across prose, line breaks, and list items', () => {
    expect(sentencesOf('Your browser asks a resolver. It walks root, TLD, then the zone.')).toEqual(
        ['Your browser asks a resolver.', 'It walks root, TLD, then the zone.']
    );
    expect(
        sentencesOf('Short version:\n- Browser cache first\n- Then the resolver\n- Then the root')
    ).toHaveLength(4);
    expect(sentencesOf('Done! Want details?\n\n`dig example.com`')).toHaveLength(3);
});

test('a citation glued to the period does not merge sentences', () => {
    expect(
        sentencesOf(
            'One.[RFC](https://a.example) Two.[RFC](https://b.example) Three.[RFC](https://c.example) Four.'
        )
    ).toHaveLength(4);
});

test('Standing Preferences ignores housekeeping in other sections', () => {
    const seeded =
        '# Blippy\n\n## Standing Preferences\n\n- None recorded yet.\n\n## Active Context\n\n- First startup.\n';
    const tidied = seeded.replace('First startup.', 'No active work.');
    const ruled = seeded.replace('None recorded yet.', 'Crew Tasks attach screenshots.');
    expect(standingPreferences(seeded)).toBe('- None recorded yet.');
    expect(standingPreferences(tidied)).toBe(standingPreferences(seeded));
    expect(standingPreferences(ruled)).not.toBe(standingPreferences(seeded));
    expect(standingPreferences('# A\n\n## Standing Preferences\n- Last section.\n')).toBe(
        '- Last section.'
    );
});

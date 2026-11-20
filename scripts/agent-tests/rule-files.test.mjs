import { expect, test } from 'bun:test';
import { sentencesOf } from './rule-files.mjs';

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

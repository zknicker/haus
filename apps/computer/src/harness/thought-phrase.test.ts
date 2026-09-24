import { describe, expect, test } from 'bun:test';
import {
    condenseThoughtLocally,
    extractThoughtTitle,
    finishThoughtPhrase,
    presentParticiple,
    thoughtPhraseMaxLength,
} from './thought-phrase.ts';

describe('thought titles', () => {
    test('uses a Codex bold title directly', () => {
        expect(extractThoughtTitle('**Inspecting chart data**')).toBe('Inspecting chart data');
        expect(
            extractThoughtTitle('\n\n**Planning memory read before messaging**\n\nI will read')
        ).toBe('Planning memory read before messaging');
    });

    test('keeps the latest of several folded titles', () => {
        expect(
            extractThoughtTitle(
                '**Designing haus-only greeting**\n**Planning memory read execution**'
            )
        ).toBe('Planning memory read execution');
    });

    test('ignores bold text that does not lead the block', () => {
        expect(extractThoughtTitle('I think **this** matters a lot here.')).toBeNull();
        expect(extractThoughtTitle('**bold** then prose on one line')).toBeNull();
    });
});

describe('local condensation', () => {
    test('strips narration filler and turns the modal verb present-progressive', () => {
        expect(
            condenseThoughtLocally(
                'Let me check the Halloween bid changes against last week. Then I will reply.'
            )
        ).toBe('Checking the Halloween bid changes against last');
        expect(condenseThoughtLocally("Okay, so I should compare the two charts' ranges.")).toBe(
            "Comparing the two charts' ranges"
        );
        expect(condenseThoughtLocally("I'm thinking about reading the memory file first.")).toBe(
            'Reading the memory file first'
        );
        expect(condenseThoughtLocally('Maybe I should run the tests again')).toBe(
            'Running the tests again'
        );
    });

    test('keeps a sentence that already reads as a status', () => {
        expect(
            condenseThoughtLocally('Listing out the primes between 100 and 160, I count 12.')
        ).toBe('Listing out the primes between 100');
    });
});

describe('phrase finishing', () => {
    test('caps words, drops dangling joiners and trailing punctuation, capitalizes', () => {
        expect(finishThoughtPhrase('reviewing the bids for the big October launch now.')).toBe(
            'Reviewing the bids for the big October'
        );
        expect(finishThoughtPhrase('"Checking the chart."')).toBe('Checking the chart');
        expect(finishThoughtPhrase('Sending it to the')).toBe('Sending it');
    });

    test('never carries URLs, paths, emails, or opaque tokens', () => {
        expect(
            finishThoughtPhrase(
                'Using fake_live_4eC39HqLyjWDarjtT1zdp7dc to call https://api.example.com as ops@example.com'
            )
        ).toBe('Using to call');
        expect(finishThoughtPhrase('Reading ~/secrets/.env now')).toBe('Reading now');
    });

    test('stays within the length cap and drops empty results', () => {
        const long = finishThoughtPhrase(`${'Supercalifragilistic '.repeat(7)}`);
        expect(long?.length).toBeLessThanOrEqual(thoughtPhraseMaxLength);
        expect(finishThoughtPhrase('  ...  ')).toBeNull();
    });

    test('forms participles for common verb shapes', () => {
        expect(
            ['check', 'make', 'run', 'tie', 'see', 'open', 'read'].map(presentParticiple)
        ).toEqual(['checking', 'making', 'running', 'tying', 'seeing', 'opening', 'reading']);
    });
});

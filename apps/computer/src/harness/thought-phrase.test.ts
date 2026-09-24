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
        expect(extractThoughtTitle('**Inspecting chart data**')).toBe("I'm inspecting chart data");
        expect(
            extractThoughtTitle('\n\n**Planning memory read before messaging**\n\nI will read')
        ).toBe("I'm planning memory read before messaging");
    });

    test('keeps the latest of several folded titles', () => {
        expect(
            extractThoughtTitle(
                '**Designing haus-only greeting**\n**Planning memory read execution**'
            )
        ).toBe("I'm planning memory read execution");
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
        ).toBe("I'm checking the Halloween bid changes against last");
        expect(condenseThoughtLocally("Okay, so I should compare the two charts' ranges.")).toBe(
            "I'm comparing the two charts' ranges"
        );
        expect(condenseThoughtLocally("I'm thinking about reading the memory file first.")).toBe(
            "I'm reading the memory file first"
        );
        expect(condenseThoughtLocally('Maybe I should run the tests again')).toBe(
            "I'm running the tests again"
        );
    });

    test('keeps a sentence that already reads as a status', () => {
        expect(
            condenseThoughtLocally('Listing out the primes between 100 and 160, I count 12.')
        ).toBe("I'm listing out the primes between 100");
    });
});

describe('phrase finishing', () => {
    test('caps words, drops dangling joiners and trailing punctuation, capitalizes', () => {
        expect(finishThoughtPhrase('reviewing the bids for the big October launch now.')).toBe(
            "I'm reviewing the bids for the big October"
        );
        expect(finishThoughtPhrase('"Checking the chart."')).toBe("I'm checking the chart");
        expect(finishThoughtPhrase('Sending it to the')).toBe("I'm sending it");
    });

    test('keeps curly-apostrophe possessives as one word', () => {
        expect(finishThoughtPhrase('Inspecting the app’s main window')).toBe(
            "I'm inspecting the app's main window"
        );
        expect(finishThoughtPhrase('‘Verifying the build’s config’')).toBe(
            "I'm verifying the build's config"
        );
    });

    test('never carries URLs, paths, emails, or opaque tokens', () => {
        expect(
            finishThoughtPhrase(
                'Using fake_live_4eC39HqLyjWDarjtT1zdp7dc to call https://api.example.com as ops@example.com'
            )
        ).toBe('Using to call');
        expect(finishThoughtPhrase('Reading ~/secrets/.env now')).toBe("I'm reading now");
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

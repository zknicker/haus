import { describe, expect, test } from 'bun:test';
import {
    condenseThoughtLocally,
    extractThoughtTitle,
    finishThoughtPhrase,
    presentParticiple,
    thoughtPhraseMaxLength,
    thoughtReasoningExcerpt,
    thoughtRequestExcerpt,
    thoughtRequestMaxLength,
} from './agent-thought-phrase.ts';

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
            'Reviewing the bids for the big October launch'
        );
        expect(finishThoughtPhrase('"Checking the chart."')).toBe('Checking the chart');
        expect(finishThoughtPhrase('Sending it to the')).toBe('Sending it');
    });

    test('drops a trailing "now" or "right now" filler', () => {
        expect(finishThoughtPhrase('Checking the NYC forecast right now')).toBe(
            'Checking the NYC forecast'
        );
        expect(finishThoughtPhrase("I'm drafting that quick availability reply now.")).toBe(
            "I'm drafting that quick availability reply"
        );
        expect(finishThoughtPhrase('Now comparing Saturday and Sunday')).toBe(
            'Now comparing Saturday and Sunday'
        );
        expect(finishThoughtPhrase('Checking which build is live now for Zach')).toBe(
            'Checking which build is live now for Zach'
        );
        expect(finishThoughtPhrase('Now')).toBe('Now');
    });

    test('keeps curly-apostrophe possessives as one word', () => {
        expect(finishThoughtPhrase('Inspecting the app’s main window')).toBe(
            "Inspecting the app's main window"
        );
        expect(finishThoughtPhrase('‘Verifying the build’s config’')).toBe(
            "Verifying the build's config"
        );
    });

    test('never carries URLs, paths, emails, or opaque tokens', () => {
        expect(
            finishThoughtPhrase(
                'Using fake_live_4eC39HqLyjWDarjtT1zdp7dc to call https://api.example.com as ops@example.com'
            )
        ).toBe('Using to call');
        expect(finishThoughtPhrase('Reading ~/secrets/.env')).toBe('Reading');
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

describe('reasoning excerpts', () => {
    test('removes URLs, paths, emails, and opaque tokens but keeps line breaks', () => {
        expect(
            thoughtReasoningExcerpt(
                'I should call https://api.example.com with fake_live_4eC39HqLyjWDarjtT1zdp7dc\n\n  and\tmail ops@example.com about ~/secrets/.env today.'
            )
        ).toBe('I should call with\nand mail about today.');
    });

    test('caps at 3,000 characters and refuses what is too short to summarize', () => {
        expect(thoughtReasoningExcerpt('Comparing the weekly bids. '.repeat(400))?.length).toBe(
            3000
        );
        expect(thoughtReasoningExcerpt('Check https://example.com/some/long/path/here now')).toBe(
            null
        );
    });
});

describe('thought request excerpt', () => {
    test('keeps mention labels and drops URLs, emails, and tokens', () => {
        expect(
            thoughtRequestExcerpt(
                '[@Blippy](agent://agt_DpiydJh7Cx4bllOz)  can you check https://ci.example.com/run/1 for ops@example.com? key fake_live_abcdefghijklmnopqrstuvwx'
            )
        ).toBe('@Blippy can you check for key');
    });

    test('caps a long request and answers null when nothing remains', () => {
        expect(thoughtRequestExcerpt('word '.repeat(200))?.length).toBeLessThanOrEqual(
            thoughtRequestMaxLength
        );
        expect(thoughtRequestExcerpt('https://example.com/only-a-link')).toBeNull();
        expect(thoughtRequestExcerpt('Weather?')).toBe('Weather?');
    });
});

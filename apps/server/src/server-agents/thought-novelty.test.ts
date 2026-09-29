import { describe, expect, test } from 'bun:test';
import {
    judgeThoughtLine,
    namesMechanism,
    repeatsShownLine,
    thoughtWordOverlap,
} from './thought-novelty.ts';

describe('thought novelty', () => {
    test('drops a line that repeats or rewords any line the run already showed', () => {
        const shown = ['Reading the Bun release notes', 'Pulling the NYC forecast'];
        expect(repeatsShownLine('Reading the Bun release notes', shown)).toBe(true);
        // Re-shown after other lines, as "Next, reading content with Haus CLI" was live.
        expect(repeatsShownLine('reading the bun release notes!', shown)).toBe(true);
        expect(repeatsShownLine('Scanning the Bun release notes', shown)).toBe(true);
        expect(repeatsShownLine('Pulling the 3-day NYC forecasts', shown)).toBe(true);
        expect(
            thoughtWordOverlap('Pulling the NYC forecast', 'Pulling the 3-day NYC forecast')
        ).toBe(0.75);
    });

    test('keeps a new step or a finding', () => {
        const shown = ['Reading the Bun release notes'];
        expect(repeatsShownLine('Comparing the three Bun releases', shown)).toBe(false);
        expect(repeatsShownLine('Bun 1.3 mostly fixes bundler bugs', shown)).toBe(false);
        expect(repeatsShownLine('Anything', [])).toBe(false);
        // Sharing the request's subject is not a repeat when the line adds a result.
        expect(
            repeatsShownLine('Confirming improved Chicago weekend weather', [
                'Retrieving the Chicago weekend weather',
            ])
        ).toBe(false);
    });

    test('flags tool and plumbing words the request does not use', () => {
        for (const line of [
            'Reading content with Haus CLI',
            "I'm filtering the three tags using jq",
            'Requesting the API data',
            'Parsing the release notes markdown',
            'Checking the JSON output',
        ]) {
            expect(namesMechanism(line, 'What changed in the last three Bun releases?')).toBe(true);
        }
        expect(namesMechanism('Comparing the last three Bun releases', 'Bun releases?')).toBe(
            false
        );
        expect(namesMechanism('Checking the weekend forecast', null)).toBe(false);
        // The person's own words are fair game.
        expect(namesMechanism('Checking the jq changelog', 'Did jq 1.8 change --arg?')).toBe(false);
        expect(namesMechanism('Comparing the two API designs', 'Which API design is better?')).toBe(
            false
        );
    });

    test('judges a line’s workstream: first and findings are new, rewordings continue', () => {
        const judge = (
            text: string,
            stream: 'new' | 'still',
            previous: string[],
            finding = false
        ) => judgeThoughtLine({ stream, text }, { finding, previous, request: 'Bun releases?' });
        const shown = ['Reading the Bun release notes'];
        expect(judge('Reading the Bun release notes', 'still', [])).toEqual({
            stream: 'new',
            text: 'Reading the Bun release notes',
        });
        expect(judge('Comparing the three Bun releases', 'new', shown)).toEqual({
            stream: 'new',
            text: 'Comparing the three Bun releases',
        });
        // A reworded "new" line continues the shown work and says so.
        expect(judge('Scanning the Bun release notes', 'new', shown)).toEqual({
            stream: 'still',
            text: 'Still scanning the Bun release notes',
        });
        expect(judge('Digging through the changelog', 'still', shown)).toEqual({
            stream: 'still',
            text: 'Still digging through the changelog',
        });
        // A finding from a result is new even when the model calls it continuing.
        expect(judge('Bun 1.4.2 fixes WebSocket leaks', 'still', shown, true)).toEqual({
            stream: 'new',
            text: 'Bun 1.4.2 fixes WebSocket leaks',
        });
        expect(judge('Checking the WebSocket fixes', 'still', shown, true)?.stream).toBe('still');
    });

    test('drops a continuing line that repeats a shown line or an earlier still line, and machinery', () => {
        const judge = (text: string, previous: string[]) =>
            judgeThoughtLine({ stream: 'still', text }, { finding: false, previous });
        expect(
            judge('Still reading the Bun release notes', ['Still reading the Bun release notes'])
        ).toBeNull();
        expect(
            judge('Scanning the Bun release notes', [
                'Reading the Bun release notes',
                'Still reading the Bun release notes',
            ])
        ).toBeNull();
        // "Still" never pushes a line past the event's 80-character cap.
        const long = judge(
            'Comparing monthly free tiers and overage pricing for Vercel, Netlify, Cloudflare',
            ['Checking the pricing pages']
        );
        expect(long?.text).toBe(
            'Still comparing monthly free tiers and overage pricing for Vercel, Netlify'
        );
        expect(long?.text.length).toBeLessThanOrEqual(80);
        expect(judge('Reading the Bun release notes', ['Reading the Bun release notes'])).toEqual({
            stream: 'still',
            text: 'Still reading the Bun release notes',
        });
        expect(
            judgeThoughtLine(
                { stream: 'new', text: 'Filtering the tags with jq' },
                { finding: false, previous: [] }
            )
        ).toBeNull();
    });
});

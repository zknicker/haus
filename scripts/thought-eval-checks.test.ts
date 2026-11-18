import { expect, test } from 'bun:test';
import { checkThoughtPhrase, opensWithI, thoughtRepeat } from './thought-eval-checks.ts';

test('flags the spot-tested bad lines', () => {
    expect(checkThoughtPhrase('Weighing external repository placement options right now')).toEqual([
        'filler "now"',
    ]);
    expect(checkThoughtPhrase("I'm drafting that quick availability reply now")).toEqual([
        'filler "now"',
    ]);
    expect(
        checkThoughtPhrase('OK, I am fixing those date errors right now', {
            banned: ['errors', 'fixing'],
        })
    ).toEqual(['filler "now"', '9 words', 'banned "errors"', 'banned "fixing"']);
    expect(
        checkThoughtPhrase('I think I need to check weather patterns', {
            banned: ['I think', 'patterns'],
            mentionsAny: ['NYC', 'forecast'],
        })
    ).toEqual(['banned "I think"', 'banned "patterns"', 'mentions none of NYC/forecast']);
});

test('passes concrete, plain lines', () => {
    expect(checkThoughtPhrase('Pulling the NYC forecast', { mentionsAny: ['NYC'] })).toEqual([]);
    expect(checkThoughtPhrase('Now comparing Saturday and Sunday')).toEqual([]);
    expect(checkThoughtPhrase('Double-checking the dates', { banned: ['error'] })).toEqual([]);
});

test('matches banned words on word boundaries only', () => {
    expect(checkThoughtPhrase('Checking the errorless build', { banned: ['error'] })).toEqual([]);
    expect(checkThoughtPhrase('Knowing the build status')).toEqual([]);
});

test('flags lines over eight words', () => {
    expect(checkThoughtPhrase('One two three four five six seven eight nine')).toEqual(['9 words']);
});

test('recognizes lines that open with the pronoun I', () => {
    expect(opensWithI("I'm checking the bids")).toBe(true);
    expect(opensWithI('I need to rerun the chart')).toBe(true);
    expect(opensWithI('I’ll pull the report')).toBe(true);
    expect(opensWithI('Inspecting the chart')).toBe(false);
    expect(opensWithI('Pulling the NYC forecast')).toBe(false);
});

test('counts a repeated line as a duplicate, ignoring case and punctuation', () => {
    expect(thoughtRepeat('Checking the build status', 'checking the build status.')).toBe(
        'duplicate'
    );
});

test('counts a reworded repeat as a near-duplicate by content words', () => {
    expect(thoughtRepeat('Checking the build status', 'OK, checking the build status')).toBe(
        'near-duplicate'
    );
    expect(thoughtRepeat('OK, checking the weather in NYC', 'Checking the NYC weather')).toBe(
        'near-duplicate'
    );
});

test('keeps different steps apart', () => {
    expect(thoughtRepeat('Checking the build status', 'Reading the failing CI log')).toBeNull();
    expect(thoughtRepeat('Pulling the forecast', 'Comparing the three days')).toBeNull();
});

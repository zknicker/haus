import { describe, expect, test } from 'bun:test';
import { narratesRequest, withoutRequestNarration } from './agent-thought-request-narration.ts';

describe('request narration', () => {
    test('catches generic and pronoun restatements without a known name', () => {
        for (const text of [
            'The user wants the NYC forecast',
            'User wants three days of weather',
            'Checking what the user needs',
            'They want me to rerun the report',
            "Understanding the user's question about dates",
            'The user request is for three days',
            "They're asking for a summary",
            "He's asking about the release",
            'She wants the chart redone',
            "The user's asking for a recap",
            'The user’s asking for a recap',
            'The user is looking for a summary',
            'Looks like they want a recap',
            'Hmm, the person needs last week’s numbers',
        ]) {
            expect([text, narratesRequest(text)]).toEqual([text, true]);
        }
    });

    test('catches the requester by name, case-insensitively, full or first name', () => {
        for (const text of [
            'Zach wants me to check the build',
            'Hmm, Zach is asking for last week’s sales',
            'Zach needs the forecast',
            'Looks like Zach wants a recap',
            "zach's asking about staging",
            "Reading Zach's request for the forecast",
            'Zach Knickerbocker asked for release notes',
            'Checking what Zach needs',
        ]) {
            expect([text, narratesRequest(text, 'Zach Knickerbocker')]).toEqual([text, true]);
        }
        expect(narratesRequest('OK, Maya asked for release notes', 'Maya')).toBe(true);
    });

    test('keeps tools, services, and other nouns as subjects of work', () => {
        for (const text of [
            'Postgres wants an index here',
            'Stripe asked for a webhook secret',
            'Vite wants a restart',
            'CI requested a rerun',
            'Build needs a rerun after the lint failure',
            'Zach wants the forecast',
            'The server asks me to re-auth',
            'It wants a token before the second page',
            'Reconciling two date formats in the export',
            'Comparing what users want in the survey',
            "I'm checking the user table for duplicates",
            'I asked the API for more rows',
            'The API asked for auth on the second page',
            'Hmm, the test wants a fixture',
            "Checking the user's request log for the 500s",
            'Reading the user request handler',
            'The salesperson field needs a default',
        ]) {
            expect([text, narratesRequest(text, 'Maya')]).toEqual([text, false]);
        }
    });

    test('matches the name only as a whole word', () => {
        for (const text of [
            "Checking Zach's request logs for the 500s",
            'Zachary wants the old schema',
            'The McZach job needs a retry',
        ]) {
            expect([text, narratesRequest(text, 'Zach')]).toEqual([text, false]);
        }
        expect(narratesRequest('Alembic wants a migration', 'Al')).toBe(false);
    });

    test('keeps the own-work clause after a named restatement', () => {
        expect(
            withoutRequestNarration('Zach wants the forecast, so let me check the API', 'Zach')
        ).toBe('let me check the API');
        expect(withoutRequestNarration('Zach wants the forecast', 'Zach')).toBeNull();
        expect(withoutRequestNarration('Vite wants a restart', 'Zach')).toBe(
            'Vite wants a restart'
        );
    });
});

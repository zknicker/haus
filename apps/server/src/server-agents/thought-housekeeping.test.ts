import { expect, test } from 'bun:test';
import { isHousekeepingThought } from './thought-housekeeping.ts';

test('drops the Agent’s own process from the fallback', () => {
    for (const text of [
        "I'm reading my memory first. Then the request.",
        'Let me check MEMORY.md and the notes it points to',
        "I'm claiming the task",
        'Checking the task board for my assignments',
        'I got an inbox notice with three new items',
        'Let me search the Haus manual for the reminder recipe',
        'Re-read my instructions about threads',
        'Before emitting a fence I should read the visuals skill',
        "I'm deciding whether to reply at all",
        "I'm drafting that quick availability reply",
        'Drafting a quick availability reply for them',
        'Ah, let me double-check this draft first',
        "I'm reviewing my draft response",
        'Composing the final answer',
    ]) {
        expect(isHousekeepingThought(text)).toBe(true);
    }
});

test('keeps work on the request, including mixed and look-alike nouns', () => {
    for (const text of [
        "Reading memory for Zach's chart preference, then pulling sales",
        'The worker’s memory usage climbs every hour',
        'Tiny asked for release notes for v0.4',
        "I'm inspecting chart data",
        'Zach wants a reminder to check the Amazon ad budget',
        // Only the leading sentence is judged, so later housekeeping never hides the work.
        'Parsing the date strings first. Then I will update the task status.',
        'Drafting a firm reply to the supplier about the late shipment',
        'Writing the reply for Maya to send the supplier',
        'Checking the API response time for the NYC forecast',
        'Double-checking the dates',
    ]) {
        expect(isHousekeepingThought(text)).toBe(false);
    }
});

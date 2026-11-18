import { expect, test } from 'bun:test';
import { clock, compactTokens, duration, hour, monthDay, tokens } from './format.ts';

test('hours read the way people say them', () => {
    expect([0, 7, 12, 16, 23].map(hour)).toEqual(['midnight', '7am', 'noon', '4pm', '11pm']);
});

test('clock times keep minutes and the meridiem', () => {
    expect(clock(7 * 60 + 5)).toBe('7:05am');
    expect(clock(12 * 60 + 30)).toBe('12:30pm');
    expect(clock(0)).toBe('12:00am');
});

test('dates and durations', () => {
    expect(monthDay('2026-03-14')).toBe('March 14');
    expect(duration(1)).toBe('1 second');
    expect(duration(45)).toBe('45 seconds');
    expect(duration(150)).toBe('3 minutes');
});

test('token counts stay readable at any size', () => {
    expect(tokens(950)).toBe('950');
    expect(tokens(48_300)).toBe('48.3 thousand');
    expect(tokens(1_000_000)).toBe('1 million');
    expect(compactTokens(1_250_000)).toBe('1.3M');
});

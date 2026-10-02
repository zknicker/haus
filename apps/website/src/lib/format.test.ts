import { expect, test } from 'vitest';
import { truncate } from './format.ts';

test('truncates string exceeding max length with ellipsis', () => {
    expect(truncate('Hello, World!', 10)).toBe('Hello, Wo…');
});

test('handles empty string correctly', () => {
    expect(truncate('', 10)).toBe('');
});

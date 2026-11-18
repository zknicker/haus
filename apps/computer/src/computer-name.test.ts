import { expect, test } from 'bun:test';
import { normalizeComputerName } from './computer-name.ts';

test('normalizes local hostnames for customer-facing Computer names', () => {
    expect(normalizeComputerName('Zachs-MacBook-Pro-2.local\n')).toBe('Zachs-MacBook-Pro-2');
    expect(normalizeComputerName('  ')).toBeNull();
});

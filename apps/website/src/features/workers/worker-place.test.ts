import { expect, test } from 'bun:test';
import { workerPlaceName, workerPlaceProvider } from './worker-place.ts';

test('a Computer place reads as its Device name, or Device, and never as its id', () => {
    const named = { computerId: 'cmp_mini', computerName: 'mini', kind: 'computer' } as const;
    const unnamed = { computerId: 'cmp_mini', computerName: null, kind: 'computer' } as const;

    expect(workerPlaceName({ place: named })).toBe('mini');
    expect(workerPlaceName({ place: unnamed })).toBe('Device');
    expect(workerPlaceProvider(named)).toBeNull();
});

test('a cloud place reads as its provider', () => {
    expect(workerPlaceName({ place: { kind: 'cursor' } })).toBe('Cursor');
    expect(workerPlaceProvider({ kind: 'claude' })).toBe('claude');
});

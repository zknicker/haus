import { expect, test } from 'bun:test';
import {
    formatWorkerPlace,
    parseWorkerPlace,
    requireCloudWorkerPlace,
    workerPlaceSchema,
    workerPlaceViewSchema,
} from './worker-place.ts';

test('each place writes as its string form and reads back', () => {
    expect(formatWorkerPlace({ computerId: 'cmp_abcdefghijklmnop', kind: 'computer' })).toBe(
        'computer:cmp_abcdefghijklmnop'
    );
    expect(formatWorkerPlace({ kind: 'cursor' })).toBe('cursor');
    expect(formatWorkerPlace({ kind: 'claude' })).toBe('claude');
    expect(parseWorkerPlace('computer:cmp_abcdefghijklmnop')).toEqual({
        computerId: 'cmp_abcdefghijklmnop',
        kind: 'computer',
    });
    expect(parseWorkerPlace(' cursor ')).toEqual({ kind: 'cursor' });
    expect(parseWorkerPlace('claude')).toEqual({ kind: 'claude' });
});

test('a Computer name is not a place string: only the Server resolves it', () => {
    expect(parseWorkerPlace('mini')).toBeNull();
    expect(parseWorkerPlace('computer:mini')).toBeNull();
    expect(parseWorkerPlace('computer:')).toBeNull();
    expect(parseWorkerPlace('Cursor')).toBeNull();
});

test('a Computer place always names its Computer', () => {
    expect(
        workerPlaceSchema.parse({ computerId: 'cmp_abcdefghijklmnop', kind: 'computer' })
    ).toEqual({ computerId: 'cmp_abcdefghijklmnop', kind: 'computer' });
    expect(workerPlaceSchema.safeParse({ kind: 'computer' }).success).toBe(false);
    expect(workerPlaceSchema.safeParse({ computerId: 'cmp_x', kind: 'cursor' }).success).toBe(
        false
    );
    expect(
        workerPlaceSchema.safeParse({
            computerId: 'cmp_abcdefghijklmnop',
            computerName: 'mini',
            kind: 'computer',
        }).success
    ).toBe(false);
});

test('the record view carries the Computer name, or null when it reported none', () => {
    expect(
        workerPlaceViewSchema.parse({
            computerId: 'cmp_abcdefghijklmnop',
            computerName: 'mini',
            kind: 'computer',
        })
    ).toEqual({ computerId: 'cmp_abcdefghijklmnop', computerName: 'mini', kind: 'computer' });
    expect(
        workerPlaceViewSchema.parse({
            computerId: 'cmp_abcdefghijklmnop',
            computerName: null,
            kind: 'computer',
        })
    ).toEqual({ computerId: 'cmp_abcdefghijklmnop', computerName: null, kind: 'computer' });
    expect(
        workerPlaceViewSchema.safeParse({ computerId: 'cmp_abcdefghijklmnop', kind: 'computer' })
            .success
    ).toBe(false);
    expect(workerPlaceViewSchema.parse({ kind: 'claude' })).toEqual({ kind: 'claude' });
});

test('only a cloud place yields a provider', () => {
    expect(requireCloudWorkerPlace({ kind: 'cursor' })).toBe('cursor');
    expect(() =>
        requireCloudWorkerPlace({ computerId: 'cmp_abcdefghijklmnop', kind: 'computer' })
    ).toThrow('Worker place computer:cmp_abcdefghijklmnop is not a cloud place.');
});

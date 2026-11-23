import { describe, expect, test } from 'bun:test';
import {
    workerPlaceFromKey,
    workerPlaceKey,
    workerPlaceLabel,
    workerPlaceOptions,
} from './worker-place-options.ts';

const studio = { id: 'cmp_studio0000000000', label: 'Studio', workersEnabled: true };
const laptop = { id: 'cmp_laptop0000000000', label: 'Laptop', workersEnabled: false };

describe('workerPlaceOptions', () => {
    test('offers no default, each Cloud Worker provider, then Devices whose switch is on', () => {
        expect(workerPlaceOptions(null, [studio, laptop])).toEqual([
            { id: 'none', label: 'No default' },
            { id: 'cursor', label: 'Cursor Cloud' },
            { id: 'claude', label: 'Claude Cloud' },
            { id: 'computer:cmp_studio0000000000', label: 'Studio' },
        ]);
    });

    test('keeps a current Device default the viewer cannot see', () => {
        const hidden = {
            computerId: 'cmp_hidden0000000000',
            computerName: 'Mac mini',
            kind: 'computer',
        } as const;
        expect(workerPlaceOptions(hidden, []).at(-1)).toEqual({
            id: 'computer:cmp_hidden0000000000',
            label: 'Mac mini',
        });
    });
});

describe('worker place keys', () => {
    test('round-trip every place through its Select key', () => {
        expect(workerPlaceFromKey(workerPlaceKey(null))).toBeNull();
        expect(workerPlaceFromKey(workerPlaceKey({ kind: 'claude' }))).toEqual({ kind: 'claude' });
        expect(
            workerPlaceFromKey(
                workerPlaceKey({
                    computerId: 'cmp_studio0000000000',
                    computerName: 'Studio',
                    kind: 'computer',
                })
            )
        ).toEqual({ computerId: 'cmp_studio0000000000', kind: 'computer' });
    });

    test('reject a key that names no place', () => {
        expect(workerPlaceFromKey('somewhere')).toBeUndefined();
    });

    test('label an unnamed Device default plainly', () => {
        expect(
            workerPlaceLabel({ computerId: 'cmp_x', computerName: null, kind: 'computer' })
        ).toBe('Device');
    });
});

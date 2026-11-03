import { afterEach, describe, expect, test } from 'bun:test';
import * as React from 'react';
import { type RooflineSnow, rooflineSnowStorageKey } from '../../lib/roofline-snow.ts';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { getRooflineSnow, selectRooflineSnow, useRooflineSnow } from './use-roofline-snow.ts';

function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
        values,
    };
}

const throwingStorage = {
    setItem: () => {
        throw new Error('blocked');
    },
};

describe('roofline snow store', () => {
    afterEach(() => selectRooflineSnow('puffy', null));

    test('a pick applies live and persists; blocked storage still applies it', () => {
        selectRooflineSnow('puffy', null);
        const storage = memoryStorage();
        selectRooflineSnow('soft', storage);
        expect(getRooflineSnow()).toBe('soft');
        expect(storage.values.get(rooflineSnowStorageKey)).toBe('soft');
        selectRooflineSnow('icicles', throwingStorage);
        expect(getRooflineSnow()).toBe('icicles');
    });

    test('re-picking the live snow writes nothing', () => {
        selectRooflineSnow('soft', null);
        const storage = memoryStorage();
        selectRooflineSnow('soft', storage);
        expect(storage.values.size).toBe(0);
    });

    test('a mounted reader follows picks made in other windows until it unmounts', async () => {
        selectRooflineSnow('puffy', null);
        const restoreDom = installFakeDom();
        const scope = globalThis as Record<string, unknown>;
        const storage = memoryStorage();
        scope.localStorage = storage;
        try {
            const { act } = React;
            const { createRoot } = await import('react-dom/client');
            const seen: RooflineSnow[] = [];
            function Probe() {
                seen.push(useRooflineSnow());
                return null;
            }
            const root = createRoot(document.createElement('div'));
            await act(async () => root.render(React.createElement(Probe)));
            expect(seen.at(-1)).toBe('puffy');

            storage.values.set(rooflineSnowStorageKey, 'icicles');
            await act(async () => window.dispatchEvent(storageEvent(rooflineSnowStorageKey)));
            expect(seen.at(-1)).toBe('icicles');

            // Another key's change leaves the snow alone; a cleared storage
            // (`key: null`) re-reads it.
            storage.values.set(rooflineSnowStorageKey, 'soft');
            await act(async () => window.dispatchEvent(storageEvent('haus.color-theme')));
            expect(seen.at(-1)).toBe('icicles');
            await act(async () => window.dispatchEvent(storageEvent(null)));
            expect(seen.at(-1)).toBe('soft');

            await act(async () => root.unmount());
            storage.values.set(rooflineSnowStorageKey, 'puffy');
            window.dispatchEvent(storageEvent(rooflineSnowStorageKey));
            expect(getRooflineSnow()).toBe('soft');
        } finally {
            // Bun has no `localStorage` of its own to put back.
            scope.localStorage = undefined;
            restoreDom();
        }
    });
});

/** Bun has no `StorageEvent`; the store reads only `key`. */
function storageEvent(key: string | null) {
    return Object.assign(new Event('storage'), { key });
}

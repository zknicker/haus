import { expect, test } from 'bun:test';
import {
    createVisualHeightCache,
    type VisualHeightStorage,
    visualHeightStorageKey,
    visualIdentity,
} from './visual-height-cache.ts';

function memoryStorage(initial?: string) {
    const items = new Map<string, string>();
    if (initial !== undefined) {
        items.set(visualHeightStorageKey, initial);
    }
    const storage: VisualHeightStorage = {
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => {
            items.set(key, value);
        },
    };
    return { items, storage };
}

test('identity is stable for a body and differs when the body changes', () => {
    expect(visualIdentity('<div>report</div>')).toBe(visualIdentity('<div>report</div>'));
    expect(visualIdentity('<div>report</div>')).not.toBe(visualIdentity('<div>report.</div>'));
});

test('a recorded height is read back at the same width', () => {
    const cache = createVisualHeightCache({ storage: () => null });

    expect(cache.read('a', 736)).toBeNull();
    cache.record('a', 736, 1432.4);
    expect(cache.read('a', 736)).toBe(1432);
});

test('the nearest recorded width answers, and unknown width takes the latest', () => {
    const cache = createVisualHeightCache({ storage: () => null });
    cache.record('a', 736, 1200);
    cache.record('a', 400, 1900);

    expect(cache.read('a', 720)).toBe(1200);
    expect(cache.read('a', 420)).toBe(1900);
    expect(cache.read('a', null)).toBe(1900);
});

test('a newer report at the same width replaces a stale height', () => {
    const cache = createVisualHeightCache({ storage: () => null });
    cache.record('a', 736, 900);
    cache.record('a', 740, 1100);

    expect(cache.read('a', 736)).toBe(1100);
});

test('nonsense reports and unlaid-out widths are ignored', () => {
    const cache = createVisualHeightCache({ storage: () => null });
    cache.record('a', 0, 900);
    cache.record('a', 736, Number.NaN);
    cache.record('a', 736, -5);
    cache.record('a', 736, Number.POSITIVE_INFINITY);

    expect(cache.read('a', 736)).toBeNull();
});

test('the cache evicts the least recently used visual past capacity', () => {
    const cache = createVisualHeightCache({ capacity: 2, storage: () => null });
    cache.record('a', 736, 100);
    cache.record('b', 736, 200);
    cache.read('a', 736);
    cache.record('c', 736, 300);

    expect(cache.read('a', 736)).toBe(100);
    expect(cache.read('b', 736)).toBeNull();
    expect(cache.read('c', 736)).toBe(300);
});

test('each visual keeps a bounded number of widths', () => {
    const cache = createVisualHeightCache({ storage: () => null, widthsPerVisual: 2 });
    cache.record('a', 320, 3000);
    cache.record('a', 480, 2000);
    cache.record('a', 736, 1000);

    expect(cache.read('a', 320)).toBe(2000);
});

test('heights persist across cache instances through storage', () => {
    const { storage } = memoryStorage();
    const first = createVisualHeightCache({ storage: () => storage });
    first.record('a', 736, 1432);
    first.flush();

    const second = createVisualHeightCache({ storage: () => storage });
    expect(second.read('a', 736)).toBe(1432);
});

test('corrupt or malformed storage degrades to an empty cache', () => {
    for (const raw of ['not json', '{"a":1}', '[["a",[["x",1]]],[1,[]]]']) {
        const { storage } = memoryStorage(raw);
        const cache = createVisualHeightCache({ storage: () => storage });
        expect(cache.read('a', 736)).toBeNull();
    }
});

test('throwing storage keeps the in-memory cache working', () => {
    const storage: VisualHeightStorage = {
        getItem: () => {
            throw new Error('denied');
        },
        setItem: () => {
            throw new Error('quota');
        },
    };
    const cache = createVisualHeightCache({ storage: () => storage });
    cache.record('a', 736, 800);
    cache.flush();

    expect(cache.read('a', 736)).toBe(800);
});

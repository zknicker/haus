import { expect, test } from 'bun:test';
import { backgroundImageTypes } from '../../lib/home-background.ts';
import { showsStillFrame } from './use-background-image-url.ts';

test('under Reduce Motion every type that can animate shows its first frame', () => {
    const still = backgroundImageTypes.filter((type) => showsStillFrame(type, true));
    expect(still).toEqual(['image/avif', 'image/gif', 'image/webp']);
    expect(backgroundImageTypes.filter((type) => showsStillFrame(type, false))).toEqual([]);
});

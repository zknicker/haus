import { expect, test } from 'bun:test';
import {
    readBackgroundImageUrl,
    retainBackgroundImageUrl,
    subscribeBackgroundImageUrls,
} from './background-image-urls.ts';

function loaded(key: string) {
    return new Promise<string>((resolve) => {
        const check = () => {
            const url = readBackgroundImageUrl(key);
            if (url.status === 'ready') {
                stop();
                resolve(url.url);
            }
        };
        const stop = subscribeBackgroundImageUrls(check);
        check();
    });
}

test('readers of one image share one object URL until the last lets go', async () => {
    const lake = () => Promise.resolve(new Blob(['lake'], { type: 'image/png' }));
    const first = retainBackgroundImageUrl('lake:false', lake);
    const second = retainBackgroundImageUrl('lake:false', lake);
    const still = retainBackgroundImageUrl('lake:true', lake);
    expect(readBackgroundImageUrl('lake:false')).toEqual({ status: 'loading' });

    const url = await loaded('lake:false');
    expect(readBackgroundImageUrl('lake:false')).toEqual({ status: 'ready', url });
    expect(await loaded('lake:true')).not.toBe(url);

    first();
    expect(await (await fetch(url)).text()).toBe('lake');
    second();
    expect(readBackgroundImageUrl('lake:false')).toEqual({ status: 'loading' });
    await expect(fetch(url)).rejects.toThrow();
    still();
});

test('an image that is gone reads as missing', async () => {
    const release = retainBackgroundImageUrl('gone:false', () => Promise.resolve(null));
    await new Promise<void>((resolve) => {
        const stop = subscribeBackgroundImageUrls(() => {
            stop();
            resolve();
        });
    });
    expect(readBackgroundImageUrl('gone:false')).toEqual({ status: 'missing' });
    release();
});

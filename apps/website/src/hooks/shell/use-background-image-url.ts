import * as React from 'react';
import { readBackgroundImage } from '../../lib/background-images.ts';
import type { BackgroundImageRef, BackgroundImageType } from '../../lib/home-background.ts';
import {
    readBackgroundImageUrl,
    retainBackgroundImageUrl,
    subscribeBackgroundImageUrls,
} from './background-image-urls.ts';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const animatableTypes: ReadonlySet<BackgroundImageType> = new Set([
    'image/avif',
    'image/gif',
    'image/webp',
]);

export function showsStillFrame(type: BackgroundImageType, reducedMotion: boolean) {
    return reducedMotion && animatableTypes.has(type);
}

export function useBackgroundImageUrl(image: BackgroundImageRef | null) {
    const canAnimate = image ? animatableTypes.has(image.type) : false;
    const reducedMotion = React.useSyncExternalStore(
        canAnimate ? subscribeReducedMotion : subscribeNever,
        canAnimate ? prefersReducedMotion : never,
        never
    );
    const id = image?.id ?? null;
    const still = image ? showsStillFrame(image.type, reducedMotion) : false;
    const key = id ? `${id}:${still}` : null;

    React.useEffect(() => {
        if (!(id && key)) {
            return;
        }
        return retainBackgroundImageUrl(key, () => loadImageBlob(id, still));
    }, [id, key, still]);

    const read = React.useCallback(() => (key ? readBackgroundImageUrl(key) : null), [key]);
    return React.useSyncExternalStore(subscribeBackgroundImageUrls, read, read);
}

async function loadImageBlob(id: string, still: boolean) {
    const blob = await readBackgroundImage(id);
    return blob && still ? firstFrame(blob) : blob;
}

async function firstFrame(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
        return await canvas.convertToBlob({ type: 'image/png' });
    } finally {
        bitmap.close();
    }
}

function subscribeReducedMotion(onChange: () => void) {
    const query = window.matchMedia(reducedMotionQuery);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}

function prefersReducedMotion() {
    return window.matchMedia(reducedMotionQuery).matches;
}

function subscribeNever() {
    return () => undefined;
}

function never() {
    return false;
}

import * as React from 'react';
import { readBackgroundImage } from '../../lib/background-images.ts';
import type { BackgroundImageRef, BackgroundImageType } from '../../lib/home-background.ts';

export type BackgroundImageUrl =
    | { readonly status: 'loading' }
    | { readonly status: 'missing' }
    | { readonly status: 'ready'; readonly url: string };

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
    const [state, setState] = React.useState<{ key: string; url: BackgroundImageUrl } | null>(null);
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
        let url: string | null = null;
        let live = true;
        loadImageBlob(id, still)
            .then((blob) => {
                if (!live) {
                    return;
                }
                url = blob ? URL.createObjectURL(blob) : null;
                setState({ key, url: url ? { status: 'ready', url } : { status: 'missing' } });
            })
            .catch(() => {
                if (live) {
                    setState({ key, url: { status: 'missing' } });
                }
            });
        return () => {
            live = false;
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
    }, [id, key, still]);

    if (!key) {
        return null;
    }
    return state?.key === key ? state.url : ({ status: 'loading' } as const);
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

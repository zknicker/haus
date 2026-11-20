import * as React from 'react';
import { readBackgroundImage } from '../../lib/background-images.ts';
import type { BackgroundImageRef } from '../../lib/home-background.ts';

export type BackgroundImageUrl =
    | { readonly status: 'loading' }
    | { readonly status: 'missing' }
    | { readonly status: 'ready'; readonly url: string };

export function useBackgroundImageUrl(image: BackgroundImageRef | null) {
    const [state, setState] = React.useState<{ id: string; url: BackgroundImageUrl } | null>(null);
    const id = image?.id ?? null;
    const isGif = image?.type === 'image/gif';

    React.useEffect(() => {
        if (!id) {
            return;
        }
        let url: string | null = null;
        let live = true;
        loadImageBlob(id, isGif && prefersReducedMotion())
            .then((blob) => {
                if (!live) {
                    return;
                }
                url = blob ? URL.createObjectURL(blob) : null;
                setState({ id, url: url ? { status: 'ready', url } : { status: 'missing' } });
            })
            .catch(() => {
                if (live) {
                    setState({ id, url: { status: 'missing' } });
                }
            });
        return () => {
            live = false;
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
    }, [id, isGif]);

    if (!id) {
        return null;
    }
    return state?.id === id ? state.url : ({ status: 'loading' } as const);
}

async function loadImageBlob(id: string, still: boolean) {
    const blob = await readBackgroundImage(id);
    return blob && still ? firstFrame(blob) : blob;
}

async function firstFrame(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.convertToBlob({ type: 'image/png' });
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

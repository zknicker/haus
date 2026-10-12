import { useEffect, useState } from 'react';

/** One image to decode, keyed by a stable id (an artifact id) rather than its signed link. */
export interface DecodableImage {
    id: string;
    url: string | undefined;
}

/**
 * The latest `url` the browser has fully decoded, or null until one has.
 * Callers show the file's kind icon until then, so a slow, refused, or broken
 * link never leaves an empty box.
 */
export function useDecodedImage(url: string | undefined): string | null {
    return useDecodedImages([{ id: 'image', url }]).get('image') ?? null;
}

/**
 * Decoded links by id. A re-signed link keeps the previous pixels until the
 * new one decodes too. A failed decode is the expected fallback, not an
 * error: that id stays absent and its icon stays.
 */
export function useDecodedImages(images: readonly DecodableImage[]): ReadonlyMap<string, string> {
    const [decoded, setDecoded] = useState<ReadonlyMap<string, string>>(new Map());
    // The effect re-runs when an id's link changes, not on every new array.
    const signature = JSON.stringify(images);
    useEffect(() => {
        let live = true;
        for (const { id, url } of JSON.parse(signature) as DecodableImage[]) {
            if (!url) {
                continue;
            }
            const image = new Image();
            image.src = url;
            decodeImage(image).then(
                () => {
                    if (live) {
                        setDecoded((current) => new Map(current).set(id, url));
                    }
                },
                () => undefined
            );
        }
        return () => {
            live = false;
        };
    }, [signature]);
    return decoded;
}

function decodeImage(image: HTMLImageElement) {
    if (typeof image.decode === 'function') {
        return image.decode();
    }
    return new Promise<void>((resolve, reject) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => reject(new Error('Image failed to load.')), {
            once: true,
        });
    });
}

import type { RooflineSnow } from '../../../lib/roofline-snow.ts';
import hollySource from './assets/holly.png';
import iciclesSource from './assets/snow-icicles.png';
import puffySource from './assets/snow-puffy.png';
import softSource from './assets/snow-soft.png';

/**
 * One painted snow style: a seamless horizontal tile (Codex image gen), the
 * height it is laid at, and how far below the window edge the bulbs' clips
 * grip it, both in CSS px.
 */
interface SnowArt {
    readonly hang: number;
    readonly height: number;
    readonly source: string;
}

export const snowArt: Readonly<Record<RooflineSnow, SnowArt>> = {
    icicles: { hang: 2.6, height: 17, source: iciclesSource },
    puffy: { hang: 4.6, height: 17, source: puffySource },
    soft: { hang: 1.2, height: 8, source: softSource },
};

/** The holly sprig tucked into the roofline's ends. */
export const hollyArt = hollySource;

// One decoded image per asset for the whole window, so a remount or a second
// roofline never fetches or decodes the art again.
const images = new Map<string, HTMLImageElement>();

export function artImage(source: string): HTMLImageElement {
    let image = images.get(source);
    if (!image) {
        image = new Image();
        image.decoding = 'async';
        image.src = source;
        images.set(source, image);
    }
    return image;
}

/** True once the image can be drawn at its natural size. */
export function isArtReady(image: HTMLImageElement): boolean {
    return image.complete && image.naturalWidth > 0;
}

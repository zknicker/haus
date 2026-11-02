import type { RooflineSnow } from '../../../lib/roofline-snow.ts';
import { artImage, hollyArt, isArtReady, snowArt } from './art.ts';
import { paintBulbs } from './bulbs.ts';
import { createFlurriesRenderer, type FlurriesRenderer } from './flurries-gl.ts';
import { type FrameLoop, startFrameLoop } from './frame-loop.ts';
import { hollySprigs } from './geometry.ts';
import {
    emptyLayout,
    measureRoofline,
    type RooflineLayout,
    type RooflinePlacement,
    rooflineNeighbors,
} from './measure.ts';
import { paintSnowLayer } from './snow-layer.ts';

/** The roofline's box and its three canvases, painted back to front. */
export interface RooflineParts {
    bulbs: HTMLCanvasElement;
    flurries: HTMLCanvasElement;
    root: HTMLElement;
    snow: HTMLCanvasElement;
}

export interface RooflineLook {
    dark: boolean;
    snow: RooflineSnow;
}

export interface Roofline {
    stop(): void;
    /** Applies a new mode or snow; nothing is drawn until the first look arrives. */
    update(look: RooflineLook): void;
}

/**
 * Backing px per CSS px, at most. Unlike the Halloween sky's soft clouds, the
 * bulbs' ribs and gloss and the 1-3px flakes need the display's own density;
 * past 2x nothing more shows.
 */
const maxScale = 2;

/**
 * Runs the roofline on its canvases until stopped: flurries (WebGL) at the
 * back, the bulbs over them, and the snow strip with its holly on top, so the
 * bulbs hang from under it. The snow and holly are one static layer, painted
 * again only when the size, the mode, or the snow changes; the flurries and
 * bulbs follow the frame loop's clock.
 */
export function startRoofline(parts: RooflineParts, placement: RooflinePlacement): Roofline {
    const bulbContext = parts.bulbs.getContext('2d');
    const snowContext = parts.snow.getContext('2d');
    const scratch = document.createElement('canvas');
    const holly = artImage(hollyArt);
    let flurries: FlurriesRenderer | null = createFlurriesRenderer(parts.flurries);
    let flurriesLost = false;
    let look: RooflineLook | null = null;
    let layout: RooflineLayout = emptyLayout;
    let snowDirty = true;
    let stopped = false;

    // The static layer: only when the size, the look, or the art changed.
    const paintSnow = (current: RooflineLook, scale: number) => {
        const resized = fitCanvas(parts.snow, layout.width, layout.height, scale);
        if (!(snowContext && (resized || snowDirty))) {
            return;
        }
        snowDirty = false;
        const art = snowArt[current.snow];
        const tile = artImage(art.source);
        const sprig = isArtReady(holly) ? holly : null;
        paintSnowLayer(snowContext, scratch, {
            dark: current.dark,
            holly: sprig,
            scale,
            sprigs: hollySprigs({
                aspect: sprig ? sprig.naturalHeight / sprig.naturalWidth : 1,
                leadEnd: layout.leadEnd,
                width: layout.width,
            }),
            tile: isArtReady(tile) ? tile : null,
            tileHeight: art.height,
            width: layout.width,
        });
    };
    const paintBulbFrame = (current: RooflineLook, scale: number, time: number) => {
        if (!bulbContext) {
            return;
        }
        fitCanvas(parts.bulbs, layout.width, layout.height, scale);
        bulbContext.setTransform(1, 0, 0, 1, 0, 0);
        bulbContext.clearRect(0, 0, parts.bulbs.width, parts.bulbs.height);
        bulbContext.setTransform(scale, 0, 0, scale, 0, 0);
        const { hang } = snowArt[current.snow];
        paintBulbs(bulbContext, layout.bulbs, { dark: current.dark, hang, time });
    };
    const draw = (time: number) => {
        if (!look) {
            return;
        }
        const scale = Math.min(maxScale, window.devicePixelRatio || 1);
        paintSnow(look, scale);
        paintBulbFrame(look, scale, time);
        if (flurries && !flurriesLost) {
            const { height, width } = layout;
            flurries.draw({ height, light: !look.dark, scale, time, width });
        }
    };
    const loop: FrameLoop = startFrameLoop(parts.root, draw, () => layout.width > 0);

    // Art that has not decoded yet repaints the static layer once it has.
    const requestArt = (source: string) => {
        const image = artImage(source);
        if (isArtReady(image)) {
            return;
        }
        image.decode().then(
            () => {
                if (!stopped) {
                    snowDirty = true;
                    loop.wake();
                }
            },
            (error: unknown) => console.warn('Roofline art failed to load.', source, error)
        );
    };
    requestArt(hollyArt);

    const measure = () => {
        layout = measureRoofline(parts.root, placement);
        snowDirty = true;
        loop.wake();
    };
    // The band's width, the sidebar's width (it moves Back and Forward and the
    // lead's end), and controls that mount after the roofline all move bulbs.
    const resizeObserver = new ResizeObserver(measure);
    const neighborObserver = new MutationObserver(measure);
    resizeObserver.observe(parts.root);
    for (const neighbor of rooflineNeighbors(parts.root, placement)) {
        resizeObserver.observe(neighbor);
        neighborObserver.observe(neighbor, { childList: true, subtree: true });
    }

    // A GPU reset or sleep can drop the context; asking for the restore and
    // rebuilding the program on it keeps the flurries from going blank for good.
    const onContextLost = (event: Event) => {
        event.preventDefault();
        flurriesLost = true;
    };
    const onContextRestored = () => {
        flurries = createFlurriesRenderer(parts.flurries);
        flurriesLost = false;
        loop.wake();
    };
    parts.flurries.addEventListener('webglcontextlost', onContextLost);
    parts.flurries.addEventListener('webglcontextrestored', onContextRestored);

    return {
        stop() {
            stopped = true;
            loop.stop();
            resizeObserver.disconnect();
            neighborObserver.disconnect();
            parts.flurries.removeEventListener('webglcontextlost', onContextLost);
            parts.flurries.removeEventListener('webglcontextrestored', onContextRestored);
            flurries?.dispose();
        },
        update(next) {
            if (look?.dark === next.dark && look.snow === next.snow) {
                return;
            }
            look = next;
            requestArt(snowArt[next.snow].source);
            snowDirty = true;
            loop.wake();
        },
    };
}

/** Sizes a canvas's backing store to its CSS box; true when it changed (which also clears it). */
function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number, scale: number) {
    const backingWidth = Math.max(1, Math.round(width * scale));
    const backingHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width === backingWidth && canvas.height === backingHeight) {
        return false;
    }
    canvas.width = backingWidth;
    canvas.height = backingHeight;
    return true;
}

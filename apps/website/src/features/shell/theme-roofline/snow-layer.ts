import { type ArtBox, snowTiles } from './geometry.ts';

export interface SnowLayer {
    dark: boolean;
    /** The holly art, or `null` until it has loaded. */
    holly: HTMLImageElement | null;
    /** Backing px per CSS px. */
    scale: number;
    sprigs: readonly ArtBox[];
    /** The snow tile, or `null` until it has loaded. */
    tile: HTMLImageElement | null;
    /** The tile's laid height, CSS px. */
    tileHeight: number;
    width: number;
}

/**
 * The roofline's static layer: the snow strip and the holly, with one soft
 * drop shadow under the pair. Painted only when the size, the mode, or the
 * snow changes. The art goes onto `scratch` first so the shadow falls from
 * the strip's whole silhouette, never from each tile under its neighbours.
 */
export function paintSnowLayer(
    target: CanvasRenderingContext2D,
    scratch: HTMLCanvasElement,
    layer: SnowLayer
) {
    const { height: backingHeight, width: backingWidth } = target.canvas;
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, backingWidth, backingHeight);
    if (scratch.width !== backingWidth || scratch.height !== backingHeight) {
        scratch.width = backingWidth;
        scratch.height = backingHeight;
    }
    const art = scratch.getContext('2d');
    if (!art) {
        return;
    }
    art.setTransform(1, 0, 0, 1, 0, 0);
    art.clearRect(0, 0, backingWidth, backingHeight);
    art.setTransform(layer.scale, 0, 0, layer.scale, 0, 0);
    const { holly, tile, tileHeight } = layer;
    if (tile) {
        const tileWidth = (tileHeight * tile.naturalWidth) / tile.naturalHeight;
        for (const { left, mirrored, width } of snowTiles(layer.width, tileWidth)) {
            drawArt(art, tile, { height: tileHeight, left, mirrored, top: 0, width });
        }
    }
    if (holly) {
        for (const sprig of layer.sprigs) {
            drawArt(art, holly, sprig);
        }
    }
    // Shadow lengths ignore the transform, so they are given in backing px.
    target.shadowColor = layer.dark ? 'rgba(0,0,0,0.55)' : 'rgba(40,60,100,0.22)';
    target.shadowBlur = 3 * layer.scale;
    target.shadowOffsetY = 1.2 * layer.scale;
    target.drawImage(scratch, 0, 0);
    target.shadowColor = 'transparent';
    target.shadowBlur = 0;
    target.shadowOffsetY = 0;
}

function drawArt(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    { height, left, mirrored, top, width }: ArtBox
) {
    if (!mirrored) {
        ctx.drawImage(image, left, top, width, height);
        return;
    }
    ctx.save();
    ctx.translate(left + width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, top, width, height);
    ctx.restore();
}

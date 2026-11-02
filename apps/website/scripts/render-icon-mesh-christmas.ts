/**
 * Renders `assets/christmas-icon.icon/Assets`, the Christmas icon's layers: the
 * standard ghost icon's own three layers, unchanged, under the nightcap the
 * in-app mark wears (`haus-santa-ghost-palette.ts`), one layer per piece of
 * glass — cone, brim and pom-pom — through the same mesh pipeline the ghost and
 * the pumpkin use, plus a white shell of the cone for the tinted and clear
 * appearances, where a deep red piece would read as a hole.
 *
 * The ghost's layers are copied from `assets/mac-icon.icon`. Every hat layer
 * shares the ghost mesh's canvas, with its piece laid where `SANTA_PLACE` puts
 * it against the ghost, so the hat lands on the head at the ghost mesh's own
 * scale. `icon.json` then places the whole composition, ghost and hat alike,
 * at 0.9× the standard tile's scale around the tile center and 40pt lower, so
 * the cone's crown clears the top edge while the ghost stays larger than a
 * fit of ghost and hat together would leave it.
 *
 * Each piece is painted in its own 192×204 box, as the mark paints it, so
 * every rim width, mask and blur keeps the proportions the stack was tuned at.
 *
 *   bun scripts/render-icon-mesh-christmas.ts      (from apps/website)
 *
 * Re-run it after `render-icon-mesh.ts` changes the ghost's mesh.
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { GlassPiece } from '../src/components/haus-ghost-figure.ts';
import { BODY_PATH } from '../src/components/haus-ghost-paths.ts';
import { SANTA_PIECES } from '../src/components/haus-santa-ghost-palette.ts';
import { GHOST_FOOTPRINT, renderIconMesh } from './render-icon-mesh.ts';
import type { MeshFootprint } from './render-icon-mesh-figure.ts';
import { nightcapProfile } from './render-icon-mesh-nightcap.ts';

/** The ghost's layers, copied as they are: the standard icon owns them. */
const GHOST_LAYERS: readonly { from: string; to: string }[] = [
    { from: 'Untitled Project - New Group (1).png', to: 'eyes.png' },
    { from: 'transparent-ghost.png', to: 'transparent-ghost.png' },
    { from: 'mesh-gradient.png', to: 'mesh-gradient.png' },
];

/** The pieces that get a white shell for the tinted and clear appearances. */
const SHELLED_PIECES: ReadonlySet<string> = new Set(['cone']);

export async function renderChristmasIcon(assetsDir = ASSETS_DIR): Promise<readonly string[]> {
    await mkdir(assetsDir, { recursive: true });
    const written: string[] = [];
    for (const layer of GHOST_LAYERS) {
        const to = path.join(assetsDir, layer.to);
        await copyFile(path.join(GHOST_ASSETS_DIR, layer.from), to);
        written.push(to);
    }

    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const [ghost, ...boxes] = await measureBoxes(page, [
            BODY_PATH,
            ...SANTA_PIECES.map((piece) => piece.figure.body),
        ]);
        for (const [index, piece] of SANTA_PIECES.entries()) {
            const box = boxes[index];
            if (!(ghost && box)) {
                throw new Error(`christmas icon: could not measure the ${piece.id} piece`);
            }
            const footprint = pieceFootprint(ghost, box, piece.place);
            written.push(
                await renderIconMesh({
                    outPath: path.join(assetsDir, `${piece.id}.png`),
                    profile: nightcapProfile(piece, footprint),
                })
            );
            if (SHELLED_PIECES.has(piece.id)) {
                const shell = path.join(assetsDir, `${piece.id}-shell.png`);
                await writeFile(shell, await renderShell(page, piece, footprint, box));
                written.push(shell);
            }
        }
    } finally {
        await browser.close();
    }
    return written;
}

/**
 * Where a piece's silhouette lands on the ghost mesh's canvas. The ghost mesh
 * maps the ghost's bounding box onto `GHOST_FOOTPRINT.content`; the piece's box
 * goes through `place` into the ghost's space and then through that same map,
 * so the mesh pipeline's own fit (box onto content, with the half-pixel inset
 * on each side) draws it at the ghost's scale times the piece's.
 */
function pieceFootprint(ghost: Box, piece: Box, place: GlassPiece['place']): MeshFootprint {
    const { canvas, content } = GHOST_FOOTPRINT;
    const scaleX = (content.right - content.left - 1) / ghost.width;
    const scaleY = (content.bottom - content.top - 1) / ghost.height;
    const toCanvasX = (x: number) => content.left + 0.5 + (x - ghost.x) * scaleX;
    const toCanvasY = (y: number) => content.top + 0.5 + (y - ghost.y) * scaleY;
    const left = place.x + piece.x * place.scale;
    const top = place.y + piece.y * place.scale;

    return {
        canvas,
        content: {
            bottom: toCanvasY(top + piece.height * place.scale) + 0.5,
            left: toCanvasX(left) - 0.5,
            right: toCanvasX(left + piece.width * place.scale) + 0.5,
            top: toCanvasY(top) - 0.5,
        },
    };
}

/** The piece's silhouette in flat white on its mesh layer's exact footprint,
    the way `pumpkin-shell.png` is the pumpkin's. */
async function renderShell(page: Page, piece: GlassPiece, footprint: MeshFootprint, box: Box) {
    const { canvas, content } = footprint;
    const scaleX = (content.right - content.left - 1) / box.width;
    const scaleY = (content.bottom - content.top - 1) / box.height;
    const x = content.left + 0.5 - box.x * scaleX;
    const y = content.top + 0.5 - box.y * scaleY;
    await page.setViewportSize(canvas);
    await page.setContent(
        `<style>html,body{margin:0;padding:0;background:transparent}</style><svg id="shell" xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><path d="${piece.figure.body}" fill="#fff" transform="translate(${x} ${y}) scale(${scaleX} ${scaleY})"/></svg>`
    );
    return await page.locator('#shell').screenshot({ omitBackground: true });
}

/** Each outline's bounding box in its own user space, as the mesh's fit reads it. */
async function measureBoxes(page: Page, paths: readonly string[]): Promise<readonly Box[]> {
    await page.setContent(
        `<svg xmlns="http://www.w3.org/2000/svg">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`
    );
    return await page.evaluate(() =>
        [...document.querySelectorAll('path')].map((element) => {
            const { height, width, x, y } = element.getBBox();
            return { height, width, x, y };
        })
    );
}

interface Box {
    height: number;
    width: number;
    x: number;
    y: number;
}

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>;

const ASSETS_DIR = fileURLToPath(
    new URL('../../../assets/christmas-icon.icon/Assets', import.meta.url)
);
const GHOST_ASSETS_DIR = fileURLToPath(
    new URL('../../../assets/mac-icon.icon/Assets', import.meta.url)
);

if (import.meta.main) {
    for (const file of await renderChristmasIcon(process.argv[2] ?? ASSETS_DIR)) {
        console.log(`[haus] christmas icon layer written to ${file}`);
    }
}

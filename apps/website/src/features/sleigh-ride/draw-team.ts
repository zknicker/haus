import { collarPoint, type DeerPose, deerSheet, type TeamPose } from './team.ts';

export interface TeamArt {
    readonly deer: CanvasImageSource;
    /** The same sheet, dimmed for the far deer of each pair. */
    readonly farDeer: CanvasImageSource;
    readonly sleigh: CanvasImageSource;
}

/**
 * Paints one pose, back to front: the far traces, the far deer, the sleigh,
 * the near traces, the near deer, then Rudolph's red glow. The traces run
 * taut from the sleigh's prow through each collar.
 */
export function drawTeam(
    context: CanvasRenderingContext2D,
    pose: TeamPose,
    art: TeamArt,
    dark: boolean
) {
    context.lineWidth = 0.7;
    context.strokeStyle = dark ? 'rgba(222,182,96,0.95)' : 'rgba(160,104,24,0.95)';
    context.lineCap = 'round';

    const farDeer = pose.ranks.flatMap((rank) => (rank.far ? [rank.far] : []));
    drawTraces(context, pose, farDeer);
    for (const deer of farDeer) {
        drawDeer(context, art.farDeer, deer, pose);
    }

    const { sleigh } = pose;
    context.save();
    context.translate(sleigh.x + sleigh.width / 2, sleigh.y + sleigh.height / 2);
    context.rotate(sleigh.tilt);
    context.drawImage(
        art.sleigh,
        -sleigh.width / 2,
        -sleigh.height / 2,
        sleigh.width,
        sleigh.height
    );
    context.restore();

    const nearDeer = pose.ranks.map((rank) => rank.near);
    drawTraces(context, pose, nearDeer);
    for (const deer of nearDeer) {
        drawDeer(context, art.deer, deer, pose);
    }
    drawNoseGlow(context, pose.nose, dark);
}

/**
 * A copy of the gallop sheet at `brightness(0.78) saturate(0.9)`, made once:
 * Safari's canvas has no `filter`, and a per-frame filter costs more than a
 * second sheet.
 */
export function dimSheet(image: HTMLImageElement): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        return null;
    }
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    dimPixels(pixels.data);
    context.putImageData(pixels, 0, 0);
    return canvas;
}

/** `brightness(0.78) saturate(0.9)` on straight RGBA, in place. */
export function dimPixels(data: Uint8ClampedArray) {
    const s = 0.9;
    const k = 0.78;
    for (let index = 0; index < data.length; index += 4) {
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        data[index] =
            k * ((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b);
        data[index + 1] =
            k * ((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b);
        data[index + 2] =
            k * ((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b);
    }
}

function drawTraces(context: CanvasRenderingContext2D, pose: TeamPose, deer: readonly DeerPose[]) {
    context.beginPath();
    context.moveTo(pose.reinFrom[0], pose.reinFrom[1]);
    for (const one of deer) {
        const [x, y] = collarPoint(one, pose.deer);
        context.lineTo(x, y + 0.25);
    }
    context.stroke();
}

function drawDeer(
    context: CanvasRenderingContext2D,
    sheet: CanvasImageSource,
    deer: DeerPose,
    pose: TeamPose
) {
    const [cellWidth, cellHeight] = deerSheet.cell;
    context.drawImage(
        sheet,
        deer.cell * cellWidth,
        0,
        cellWidth,
        cellHeight,
        deer.x,
        deer.y,
        pose.deer.width,
        pose.deer.height
    );
}

/** Rudolph's nose: a small red halo, added light on the night ground. */
function drawNoseGlow(context: CanvasRenderingContext2D, [x, y]: TeamPose['nose'], dark: boolean) {
    const radius = 5;
    const alpha = dark ? 0.6 : 0.3;
    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255,60,50,${alpha})`);
    glow.addColorStop(0.35, `rgba(255,60,50,${alpha * 0.32})`);
    glow.addColorStop(1, 'rgba(255,60,50,0)');
    context.save();
    context.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.restore();
}

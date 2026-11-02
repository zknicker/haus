import type { BulbSlot } from './geometry.ts';

type Rgb = readonly [number, number, number];

/** Toy Box C9s, in order along the grid: red, gold, green, blue, pink. */
const toyColors: readonly [Rgb, ...Rgb[]] = [
    [255, 64, 64],
    [255, 196, 46],
    [44, 200, 106],
    [58, 140, 255],
    [255, 104, 184],
];
/** How long one swell lasts, in seconds. */
const swellSeconds = 3.4;
/** A bulb swells once every 9 to 23 seconds, on its own clock. */
const swellPeriodMin = 9;
const swellPeriodRange = 14;

export interface BulbPaint {
    dark: boolean;
    /** How far below the window edge the clips grip the snow, in CSS px. */
    hang: number;
    time: number;
}

export function bulbColor(slot: number): Rgb {
    return toyColors[slot % toyColors.length] ?? toyColors[0];
}

/**
 * How far into its occasional swell a bulb is at `time` (seconds): 0 for the
 * steady glow, rising to 1 and settling over 3.4s. Each slot keeps its own
 * period and phase, so the swells never sync up and nothing twinkles.
 */
export function bulbSwell(slot: number, time: number): number {
    const seed = slotHash(slot + 11);
    const period = swellPeriodMin + seed * swellPeriodRange;
    const phase = (time + seed * 97) % period;
    return phase < swellSeconds ? Math.sin((Math.PI * phase) / swellSeconds) ** 2 : 0;
}

/**
 * Paints every bulb, hanging from `hang` below the window edge. The caller
 * has cleared the canvas and scaled it to CSS px.
 */
export function paintBulbs(
    ctx: CanvasRenderingContext2D,
    bulbs: readonly BulbSlot[],
    { dark, hang, time }: BulbPaint
) {
    const socket = socketGradient(ctx, dark);
    for (const { slot, x } of bulbs) {
        paintBulb(ctx, {
            color: bulbColor(slot),
            dark,
            socket,
            swell: bulbSwell(slot, time),
            x,
            y: hang,
        });
    }
}

/**
 * One C9: roofline clip, ribbed socket, teardrop body, one gloss stroke, and
 * its halo. A swell lifts it about 14% brighter and widens the halo a little.
 */
function paintBulb(
    ctx: CanvasRenderingContext2D,
    {
        color,
        dark,
        socket,
        swell,
        x,
        y,
    }: { color: Rgb; dark: boolean; socket: CanvasGradient; swell: number; x: number; y: number }
) {
    const bright = 0.86 + 0.14 * swell;
    ctx.save();
    ctx.translate(x, y);
    halo(ctx, {
        alpha: (dark ? 0.4 : 0.24) * (0.85 + 0.35 * swell),
        color,
        dark,
        radius: (dark ? 24 : 14) * (1 + 0.18 * swell),
        y: 14.5,
    });
    // The roofline clip.
    ctx.fillStyle = dark ? '#3f6e50' : '#1d4a2e';
    roundRect(ctx, -2.3, -1.4, 4.6, 3.6, 1);
    ctx.fill();
    // The chunky ribbed socket.
    ctx.fillStyle = socket;
    roundRect(ctx, -3.1, 1.6, 6.2, 5.6, 1.8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-2.6, 3.6);
    ctx.lineTo(2.6, 3.6);
    ctx.moveTo(-2.6, 5.3);
    ctx.lineTo(2.6, 5.3);
    ctx.stroke();
    // The teardrop body.
    ctx.translate(0, 6.8);
    const body = ctx.createRadialGradient(-1.4, 5, 0.5, 0, 6.5, 11.5);
    body.addColorStop(0, `rgb(${lift(color, 0.5 * bright)})`);
    body.addColorStop(0.45, `rgb(${lift(color, 0.06 * bright)})`);
    body.addColorStop(1, `rgb(${dim(color, 0.58 + 0.12 * bright)})`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-2.9, 0);
    ctx.bezierCurveTo(-6.6, 2.4, -6.4, 9.8, 0, 15);
    ctx.bezierCurveTo(6.4, 9.8, 6.6, 2.4, 2.9, 0);
    ctx.closePath();
    ctx.fill();
    // The gloss: one stroke down the shoulder and a glint near the tip.
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3.3, 3.2);
    ctx.quadraticCurveTo(-4.6, 6.6, -2.7, 9.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(-1.4, 11.4, 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/** The glow: added light on dark grounds, a soft tint over light ones. */
function halo(
    ctx: CanvasRenderingContext2D,
    {
        alpha,
        color,
        dark,
        radius,
        y,
    }: { alpha: number; color: Rgb; dark: boolean; radius: number; y: number }
) {
    const rgb = color.join(',');
    const glow = ctx.createRadialGradient(0, y, 0, 0, y, radius);
    glow.addColorStop(0, `rgba(${rgb},${alpha})`);
    glow.addColorStop(0.35, `rgba(${rgb},${alpha * 0.32})`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    ctx.fillStyle = glow;
    ctx.fillRect(-radius, y - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = 'source-over';
}

/** Shared by every bulb in a frame: it is drawn in each bulb's own translated space. */
function socketGradient(ctx: CanvasRenderingContext2D, dark: boolean): CanvasGradient {
    const socket = ctx.createLinearGradient(-3.1, 0, 3.1, 0);
    socket.addColorStop(0, dark ? '#2a5a3a' : '#1f4d30');
    socket.addColorStop(0.4, dark ? '#4f8a62' : '#3b7a50');
    socket.addColorStop(1, dark ? '#1c3f29' : '#163a24');
    return socket;
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

const lift = (color: Rgb, amount: number) =>
    color.map((channel) => Math.round(channel + (255 - channel) * amount)).join(',');

const dim = (color: Rgb, amount: number) =>
    color.map((channel) => Math.round(channel * amount)).join(',');

/** A stable pseudo-random 0..1 per slot. */
function slotHash(value: number): number {
    return Math.abs((Math.sin(value * 12.9898 + 4.1) * 43_758.5453) % 1);
}

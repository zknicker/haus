/**
 * Where the roofline's pieces go, in CSS px from its leading edge (y down,
 * from the window's top edge). Pure, so the layout is testable without a
 * canvas.
 */

/** A horizontal run the bulbs keep clear of: the traffic lights' room, or a control's box. */
export interface Span {
    end: number;
    start: number;
}

/** One hanging bulb. `slot` is its place on the 40px grid, which keys its color and clock. */
export interface BulbSlot {
    slot: number;
    x: number;
}

/** One copy of the snow tile; `left` and `width` already include the overlap. */
export interface SnowTile {
    left: number;
    mirrored: boolean;
    width: number;
}

/** Where one piece of art is drawn; a mirrored piece is flipped about its own box. */
export interface ArtBox {
    height: number;
    left: number;
    mirrored: boolean;
    top: number;
    width: number;
}

/** Toy Box C9s hang every 40px. */
export const bulbSpacing = 40;
/** The first slot sits 14px past where the grid starts, as on the mock's lead. */
const gridPhase = 14;
/** Half a bulb body (~13px wide): the trailing edge never cuts one in half. */
const bulbHalfWidth = 7;
/** Half a bulb plus 3px of air: how close a bulb may hang to a control. */
const bulbReach = 10;
/**
 * Each tile copy reaches this far past both of its ends, so a join that lands
 * on a fractional pixel never antialiases into a hairline gap.
 */
export const tileOverlap = 0.35;
/** The sprig's drawn width; its height follows the art. */
export const sprigWidth = 22;
/** The sprig peeks 5px above the window edge, so only its leaves and berries show. */
const sprigTop = -5;
/** The lead's sprig tucks in 7px before the lead's end, over the join with the tab rows. */
const leadSprigInset = 7;
/** The trailing sprig hugs the right edge, 3px of it past the window. */
const endSprigOverhang = 3;

/**
 * The grid from `start` to the trailing edge, minus every slot whose bulb
 * would hang behind something in `skip`. Slot numbers count the whole grid,
 * skipped slots included, so a bulb keeps its color and clock while controls
 * move past it (a sidebar resize).
 */
export function bulbSlots({
    skip,
    start,
    width,
}: {
    skip: readonly Span[];
    start: number;
    width: number;
}): BulbSlot[] {
    const bulbs: BulbSlot[] = [];
    for (let slot = 0; ; slot++) {
        const x = start + gridPhase + slot * bulbSpacing;
        if (x + bulbHalfWidth > width) {
            return bulbs;
        }
        const blocked = skip.some((span) => x + bulbReach > span.start && x - bulbReach < span.end);
        if (!blocked) {
            bulbs.push({ slot, x });
        }
    }
}

/**
 * The snow strip, laid left to right from the window's edge. Every other copy
 * is mirrored: the painted tile is seamless with itself, so a mirrored
 * neighbour meets it seamlessly too, and the pattern repeats half as often.
 */
export function snowTiles(width: number, tileWidth: number): SnowTile[] {
    if (!(tileWidth > 0)) {
        return [];
    }
    const tiles: SnowTile[] = [];
    for (let index = 0; index * tileWidth < width; index++) {
        tiles.push({
            left: index * tileWidth - tileOverlap,
            mirrored: index % 2 === 1,
            width: tileWidth + tileOverlap * 2,
        });
    }
    return tiles;
}

/**
 * The holly: one sprig tucked at the lead's end (when the placement has a
 * lead) and one mirrored at the trailing edge. `aspect` is the art's
 * height over its width.
 */
export function hollySprigs({
    aspect,
    leadEnd,
    width,
}: {
    aspect: number;
    leadEnd: number | null;
    width: number;
}): ArtBox[] {
    const height = sprigWidth * aspect;
    const end: ArtBox = {
        height,
        left: width + endSprigOverhang - sprigWidth,
        mirrored: true,
        top: sprigTop,
        width: sprigWidth,
    };
    if (leadEnd === null) {
        return [end];
    }
    const lead: ArtBox = {
        height,
        left: leadEnd - leadSprigInset,
        mirrored: false,
        top: sprigTop,
        width: sprigWidth,
    };
    return [lead, end];
}

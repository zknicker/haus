/**
 * Where every member of Santa's team is at a moment of the ride: pure
 * geometry, so the gallop's phases and the reins' anchor are testable without
 * a canvas. Ported from the approved mock board ("Reindeer fly-by", Over the
 * greeting). All lengths are CSS px.
 *
 * The team flies right along one long, shallow wave, so every member follows
 * the same curve like a train: the sleigh at the rear, then four pairs of
 * reindeer, then Rudolph alone in the lead.
 */
export const team = {
    /** Seconds per gallop cycle: four painted frames at 8 per second. */
    cycle: 0.5,
    /** Air between the sleigh's front and the wheel pair. */
    gap: 4,
    /** Reindeer height. */
    deerHeight: 17,
    /** Pairs behind Rudolph. */
    pairs: 4,
    /** Distance from one rank to the next. */
    rank: 13,
    /** Sleigh width. */
    sleighWidth: 30,
} as const;

/** The flight path: speed along the page and the wave's height. */
export const path = { amplitude: 4.5, speed: 180 } as const;

/** Gallop sheet A: one row of 66x67 cells, four deer frames then Rudolph's four. */
export const deerSheet = {
    cell: [66, 67],
    deer: [0, 1, 2, 3],
    rudolph: [4, 5, 6, 7],
} as const;

/** The solo sleigh sprite's own box (`assets/sleigh.webp`). */
export const sleighSprite = { height: 131, width: 152 } as const;

/**
 * Where the reins leave the sleigh, as a fraction of its sprite: the prow,
 * the front of the red body low and just under the gold curl, well below the
 * ghost.
 */
export const reinAnchor = { x: 0.91, y: 0.64 } as const;

/** The far deer of each pair: a step up and back, and a frame behind its partner. */
export const farDeer = { dx: -3.6, dy: -3.2, lag: 0.25 } as const;

export interface DeerPose {
    /** Index into the sheet's cells. */
    readonly cell: number;
    readonly x: number;
    readonly y: number;
}

export interface RankPose {
    /** The far deer, drawn behind; null for Rudolph, who runs alone. */
    readonly far: DeerPose | null;
    readonly lead: boolean;
    readonly near: DeerPose;
}

export interface TeamPose {
    readonly deer: { readonly height: number; readonly width: number };
    /** Rudolph's nose, for the red glow. */
    readonly nose: readonly [number, number];
    readonly ranks: readonly RankPose[];
    /** Where the reins leave the sleigh's prow, turned with its tilt. */
    readonly reinFrom: readonly [number, number];
    readonly sleigh: {
        readonly height: number;
        /** Radians, about the sleigh's center. */
        readonly tilt: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
    };
}

/** The whole team's length, sleigh rear to Rudolph's nose. */
export function teamLength(): number {
    return team.sleighWidth + team.gap + team.pairs * team.rank + deerWidth();
}

/**
 * The team at `t` seconds into the ride with the sleigh's rear at `x`, riding
 * a wave centered on `baseY`. `amplitude` 0 gallops in place.
 */
export function teamPose(
    t: number,
    x: number,
    baseY: number,
    amplitude: number = path.amplitude
): TeamPose {
    const deerHeight = team.deerHeight;
    const width = deerWidth();
    const sleighWidth = team.sleighWidth;
    const sleighHeight = (sleighWidth * sleighSprite.height) / sleighSprite.width;
    const wave = (at: number) => baseY + amplitude * Math.sin(at / 140 + 0.6);
    const slope = (at: number) => (amplitude * Math.cos(at / 140 + 0.6)) / 140;

    const ranks: RankPose[] = [];
    for (let index = 0; index <= team.pairs; index++) {
        const lead = index === team.pairs;
        const rankX = x + sleighWidth + team.gap + index * team.rank;
        const phase = rankPhase(index);
        const y = wave(rankX + width / 2) - deerHeight * 0.62 + strideBob(t, phase);
        const near = { cell: gallopCell(t, phase, lead), x: rankX, y };
        const far = lead
            ? null
            : {
                  cell: gallopCell(t, phase - farDeer.lag, false),
                  x: rankX + farDeer.dx,
                  y: y + farDeer.dy,
              };
        ranks.push({ far, lead, near });
    }

    // The sleigh bobs a beat behind the lead, on its own slower swing.
    const sleighY =
        wave(x + sleighWidth / 2) - sleighHeight * 0.55 + 0.9 * Math.sin(2 * Math.PI * t - 1.4);
    const tilt = Math.atan(slope(x)) * 0.6;
    const sleigh = { height: sleighHeight, tilt, width: sleighWidth, x, y: sleighY };
    const leadPose = ranks.at(-1)?.near ?? { cell: 0, x, y: sleighY };
    return {
        deer: { height: deerHeight, width },
        nose: [leadPose.x + width * 0.93, leadPose.y + deerHeight * 0.36],
        ranks,
        reinFrom: reinPoint(sleigh),
        sleigh,
    };
}

/** Where a deer's traces meet its collar. */
export function collarPoint(deer: DeerPose, size: TeamPose['deer']): [number, number] {
    return [deer.x + size.width * 0.62, deer.y + size.height * 0.6];
}

/** The prow's anchor in page space, turned with the sleigh's tilt about its center. */
export function reinPoint(sleigh: TeamPose['sleigh']): [number, number] {
    const dx = (reinAnchor.x - 0.5) * sleigh.width;
    const dy = (reinAnchor.y - 0.5) * sleigh.height;
    const cos = Math.cos(sleigh.tilt);
    const sin = Math.sin(sleigh.tilt);
    return [
        sleigh.x + sleigh.width / 2 + dx * cos - dy * sin,
        sleigh.y + sleigh.height / 2 + dx * sin + dy * cos,
    ];
}

/**
 * Ranks run a quarter-cycle apart, as on the mock board (`-index * 0.25`): rank 0 is the wheel
 * pair, and each rank toward the lead is a quarter-cycle (one frame) later in its stride.
 */
export function rankPhase(index: number): number {
    return -index * 0.25;
}

/** The sheet cell for a gallop at `t` seconds, `phase` cycles ahead. */
export function gallopCell(t: number, phase: number, rudolph: boolean): number {
    const frames = rudolph ? deerSheet.rudolph : deerSheet.deer;
    const progress = (((t / team.cycle + phase) % 1) + 1) % 1;
    return frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))] ?? frames[0];
}

/** A half-pixel lift on each stride. */
export function strideBob(t: number, phase: number): number {
    return -0.55 * Math.sin(2 * Math.PI * (t / team.cycle + phase));
}

function deerWidth(): number {
    return (deerSheet.cell[0] / deerSheet.cell[1]) * team.deerHeight;
}

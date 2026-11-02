import { describe, expect, test } from 'bun:test';
import {
    collarPoint,
    deerSheet,
    gallopCell,
    rankPhase,
    reinAnchor,
    reinPoint,
    strideBob,
    team,
    teamLength,
    teamPose,
} from './team.ts';

const frameSeconds = team.cycle / 4;

describe('gallop', () => {
    test('steps through four frames at 8 per second', () => {
        expect(frameSeconds).toBe(1 / 8);
        const cells = [0, 1, 2, 3, 4].map((step) =>
            gallopCell(step * frameSeconds + 0.01, 0, false)
        );
        expect(cells).toEqual([0, 1, 2, 3, 0]);
    });

    test('Rudolph runs his own four frames', () => {
        const cells = [0, 1, 2, 3].map((step) => gallopCell(step * frameSeconds + 0.01, 0, true));
        expect(cells).toEqual([...deerSheet.rudolph]);
    });

    test('ranks run a quarter-cycle (one frame) apart', () => {
        const t = 2 * frameSeconds + 0.01;
        const pose = teamPose(t, 0, 20, 0);
        const near = pose.ranks.map((rank) => rank.near.cell);
        // Wheel pair (rank 0) to the leaders' pair (rank 3), then Rudolph.
        expect(near).toEqual([2, 1, 0, 3, deerSheet.rudolph[2]]);
        for (let index = 1; index < team.pairs; index++) {
            expect(rankPhase(index)).toBe(rankPhase(index - 1) - 0.25);
        }
    });

    test('the far deer runs a frame behind its partner, offset up and back', () => {
        const t = 3 * frameSeconds + 0.01;
        const pose = teamPose(t, 0, 20, 0);
        for (const rank of pose.ranks) {
            if (rank.lead) {
                expect(rank.far).toBeNull();
                continue;
            }
            const far = rank.far;
            expect(far).not.toBeNull();
            if (!far) {
                continue;
            }
            expect(far.cell).toBe((rank.near.cell + 3) % 4);
            expect(far.x).toBeCloseTo(rank.near.x - 3.6);
            expect(far.y).toBeCloseTo(rank.near.y - 3.2);
        }
    });

    test('a half-pixel bob rides each stride', () => {
        const samples = Array.from({ length: 40 }, (_, step) => strideBob(step / 80, 0));
        expect(Math.max(...samples)).toBeCloseTo(0.55, 1);
        expect(Math.min(...samples)).toBeCloseTo(-0.55, 1);
    });
});

describe('team', () => {
    test('is Rudolph and four pairs, about 103px long', () => {
        const pose = teamPose(0, 0, 20);
        expect(pose.ranks).toHaveLength(5);
        expect(pose.ranks.filter((rank) => rank.lead)).toHaveLength(1);
        expect(pose.ranks.at(-1)?.lead).toBe(true);
        expect(teamLength()).toBeCloseTo(102.75, 1);
    });
});

describe('reins', () => {
    const level = { height: 30 * (131 / 152), tilt: 0, width: 30, x: 100, y: 10 };

    test('leave the sleigh’s prow, not the ghost', () => {
        const [x, y] = reinPoint(level);
        expect(x).toBeCloseTo(level.x + reinAnchor.x * level.width);
        expect(y).toBeCloseTo(level.y + reinAnchor.y * level.height);
        // The prow: the front of the red body, in the sprite's lower half.
        expect(reinAnchor).toEqual({ x: 0.91, y: 0.64 });
        expect(y - level.y).toBeGreaterThan(level.height / 2);
    });

    test('stay pinned to the prow as the sleigh tilts', () => {
        for (const tilt of [-0.2, -0.05, 0.05, 0.2]) {
            const sleigh = { ...level, tilt };
            const [x, y] = reinPoint(sleigh);
            const cx = sleigh.x + sleigh.width / 2;
            const cy = sleigh.y + sleigh.height / 2;
            // The anchor keeps its distance from the sleigh's center and turns by exactly the tilt.
            const [lx, ly] = reinPoint(level);
            expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(Math.hypot(lx - cx, ly - cy));
            const turned = Math.atan2(y - cy, x - cx) - Math.atan2(ly - cy, lx - cx);
            expect(turned).toBeCloseTo(tilt);
        }
    });

    test('the pose carries the tilted anchor and runs forward to every collar', () => {
        const pose = teamPose(1.3, 200, 20);
        expect(pose.sleigh.tilt).not.toBe(0);
        expect(pose.reinFrom).toEqual(reinPoint(pose.sleigh));
        for (const rank of pose.ranks) {
            const [collarX] = collarPoint(rank.near, pose.deer);
            expect(collarX).toBeGreaterThan(pose.reinFrom[0]);
        }
    });
});

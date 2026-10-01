import { describe, expect, test } from 'bun:test';
import { hausStatusEntranceMotion } from './haus-status-entrance.tsx';

const transformKeys = ['scale', 'x', 'y', 'rotate'];

describe('hausStatusEntranceMotion', () => {
    test('enters with a small rise and scale, then rests at identity', () => {
        const entrance = hausStatusEntranceMotion(false);
        expect(entrance.initial).toMatchObject({ opacity: 0, scale: 0.85, y: 6 });
        expect(entrance.animate).toEqual({ opacity: 1, scale: 1, y: 0 });
        expect(entrance.exit).toMatchObject({ opacity: 0 });
    });

    test('reduced motion fades without any transform', () => {
        const entrance = hausStatusEntranceMotion(true);
        for (const target of [entrance.initial, entrance.animate, entrance.exit]) {
            for (const key of transformKeys) {
                expect(target).not.toHaveProperty(key);
            }
        }
        expect(entrance.initial).toEqual({ opacity: 0 });
        expect(entrance.animate).toEqual({ opacity: 1 });
    });
});

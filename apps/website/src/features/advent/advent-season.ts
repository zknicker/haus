import { adventDoorCount } from '@haus/api';
import type { LocalDay } from './local-today.ts';

/**
 * The advent calendar's season in the member's local time: Dec 1 to Jan 6.
 * `today` is the door of the day, 1 to 24; 25 means every door stands open
 * (Christmas Day through Twelfth Night). In January the calendar is still
 * last December's.
 */
export interface AdventSeason {
    readonly today: number;
    readonly year: number;
}

/** Every door open: the value of `today` from Christmas Day on. */
export const allDoorsOpen = adventDoorCount + 1;

/** The last January day the calendar stays up. */
const twelfthNight = 6;

export function adventSeason({ day, month, year }: LocalDay): AdventSeason | null {
    if (month === 12) {
        return { today: Math.min(day, allDoorsOpen), year };
    }
    if (month === 1 && day <= twelfthNight) {
        return { today: allDoorsOpen, year: year - 1 };
    }
    return null;
}

/**
 * Where one door stands. A past door is open with its ornament; today's is
 * closed until the member opens it here, then stays open; doors to come are
 * frosted and locked.
 */
export type DoorState = 'past' | 'today-closed' | 'today-open' | 'locked';

export function doorState(door: number, today: number, opened: ReadonlySet<number>): DoorState {
    if (door < today) {
        return 'past';
    }
    if (door === today) {
        return opened.has(door) ? 'today-open' : 'today-closed';
    }
    return 'locked';
}

/** True while today's door is still shut: the chip's dot. */
export function isTodayUnopened(season: AdventSeason, opened: ReadonlySet<number>) {
    return season.today <= adventDoorCount && !opened.has(season.today);
}

/** The painted door for each day, red, green and gold in turn. */
export type DoorColor = 'red' | 'green' | 'gold';

const doorColors: readonly DoorColor[] = ['red', 'green', 'gold'];

export function doorColor(door: number): DoorColor {
    return doorColors[(door - 1) % doorColors.length] ?? 'red';
}

/** Days 1 to 24, in door order. */
export const adventDoors: readonly number[] = Array.from(
    { length: adventDoorCount },
    (_, index) => index + 1
);

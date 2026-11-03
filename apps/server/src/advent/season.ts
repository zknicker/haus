import { adventDoorCount } from '@haus/api';

/**
 * The advent calendar's gates. The App sends its own local day of December; the
 * Server only refuses a day no place on Earth has reached yet, so a member east
 * of the Server never waits on its clock and nobody opens tomorrow's door early.
 */

/** UTC+14 (Line Islands) is the first place on Earth to reach any date. */
const earliestZoneLeadMs = 14 * 60 * 60 * 1000;
const decemberMonthIndex = 11;
/** Dec 25 and later open every door. */
const allDoors = adventDoorCount + 1;

export class AdventDoorLockedError extends Error {
    constructor(throughDay: number, openThrough: number) {
        super(
            openThrough === 0
                ? 'The advent calendar has not opened yet.'
                : `Door ${throughDay} is still shut; doors are open through ${openThrough}.`
        );
        this.name = 'AdventDoorLockedError';
    }
}

export class AdventTimeZoneError extends Error {
    constructor(timeZone: string) {
        super(`"${timeZone}" is not an IANA time zone.`);
        this.name = 'AdventTimeZoneError';
    }
}

/**
 * The latest `throughDay` anyone may ask for in `year` at `now`: 0 before Dec 1
 * anywhere on Earth, the day of December in UTC+14 during the season, and 25
 * once Christmas has reached UTC+14 or the year is past.
 */
export function latestOpenDay(year: number, now: Date): number {
    const earliest = new Date(now.getTime() + earliestZoneLeadMs);
    const earliestYear = earliest.getUTCFullYear();
    if (earliestYear > year) {
        return allDoors;
    }
    if (earliestYear < year || earliest.getUTCMonth() < decemberMonthIndex) {
        return 0;
    }
    return Math.min(earliest.getUTCDate(), allDoors);
}

/**
 * The doors to compute: 1 through min(throughDay, 24), refused past the open
 * limit. `preview` skips the date gate so a development Server can show any
 * door's copy out of season; callers derive it from development auth only.
 */
export function openDoors(
    input: { throughDay: number; year: number },
    now: Date,
    options: { preview: boolean } = { preview: false }
): number[] {
    const openThrough = latestOpenDay(input.year, now);
    if (!options.preview && input.throughDay > openThrough) {
        throw new AdventDoorLockedError(input.throughDay, openThrough);
    }
    const lastDoor = Math.min(input.throughDay, adventDoorCount);
    return Array.from({ length: lastDoor }, (_, index) => index + 1);
}

/**
 * Accepts only a named IANA zone the runtime knows. Bare offsets such as
 * `+05:00` are refused: PostgreSQL reads POSIX offsets with the sign inverted,
 * so the hour buckets would silently land on the wrong side of the day.
 */
export function requireIanaTimeZone(timeZone: string): string {
    if (!ianaZoneName.test(timeZone)) {
        throw new AdventTimeZoneError(timeZone);
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
        throw new AdventTimeZoneError(timeZone);
    }
    return timeZone;
}

const ianaZoneName = /^(?:UTC|[A-Za-z][A-Za-z_-]*(?:\/[A-Za-z0-9_+-]+)+)$/;

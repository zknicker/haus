import { createHash } from 'node:crypto';

const minute = 60_000;
const latestSeededMinute = 11 * 60;

/**
 * Turns "today 08:30" and "yesterday 11:30" into instants that are always in the
 * past. Once the local day is past the last seeded slot (plus a margin) the wall
 * times are real; earlier in the day they are spread across the hours that have
 * passed, with a floor of four hours so the order and the run lengths survive.
 */
export function createSeedClock(now: Date): (day: 0 | 1, time: string) => Date {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const useWallTime = now.getTime() - midnight.getTime() >= (latestSeededMinute + 20) * minute;
    const spreadStart = Math.min(midnight.getTime(), now.getTime() - 4 * 60 * minute);
    return (day, time) => {
        const [hours = 0, minutes = 0] = time.split(':').map(Number);
        if (day === 1 || useWallTime) {
            const wall = new Date(midnight);
            wall.setDate(wall.getDate() - day);
            wall.setHours(hours, minutes, 0, 0);
            return wall;
        }
        const share = (hours * 60 + minutes) / (24 * 60);
        const span = now.getTime() - 5 * minute - spreadStart;
        return new Date(spreadStart + share * span);
    };
}

/** `YYYY-MM-DD` in the Server's local zone, the shape of a heartbeat's local date. */
export function localDateOf(at: Date): string {
    const month = String(at.getMonth() + 1).padStart(2, '0');
    const day = String(at.getDate()).padStart(2, '0');
    return `${at.getFullYear()}-${month}-${day}`;
}

/** A deterministic id in the product's shape (`<prefix>_` plus sixteen url-safe characters). */
export function stableId(prefix: string, key: string): string {
    return `${prefix}_${createHash('sha256').update(key).digest('base64url').slice(0, 16)}`;
}

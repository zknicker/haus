import type { DayPart, GreetingSet } from '../../../lib/color-themes.ts';

/**
 * Greeting by the reader's own clock. A name is required: a bare "Good
 * morning" addresses nobody, so the caller waits for the member directory
 * rather than greeting a blank. A color theme may bring its own pools
 * (`ColorThemeDefinition.greetings`); `null` keeps the standard line.
 *
 * A pool line is picked from the local date and the part of the day, so it
 * holds through the bucket (no flicker on re-render or reload) and changes
 * day to day.
 */
export function greetingLine(
    now: number,
    displayName: string,
    greetings: GreetingSet | null
): string {
    const date = new Date(now);
    const part = dayPart(date.getHours());
    const pool = (greetings ?? STANDARD_GREETINGS)[part];
    const seed = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${part}`;
    const line = pool[hash(seed) % pool.length] ?? pool[0];
    const name = firstName(displayName);
    // A replacer function, so a `$` in the name is never read as a pattern.
    return line.replaceAll('{name}', () => name);
}

const STANDARD_GREETINGS: GreetingSet = {
    afternoon: ['Good afternoon, {name}'],
    evening: ['Good evening, {name}'],
    morning: ['Good morning, {name}'],
};

function dayPart(hour: number): DayPart {
    if (hour < 12) {
        return 'morning';
    }
    return hour < 18 ? 'afternoon' : 'evening';
}

/** A greeting uses the name a person is called, not their filing name. */
function firstName(displayName: string): string {
    return displayName.trim().split(/\s+/u)[0] ?? displayName;
}

/** FNV-1a, 32-bit: a stable, well-spread pick with no randomness. */
function hash(value: string): number {
    let result = 0x81_1c_9d_c5;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 0x01_00_01_93);
    }
    return result >>> 0;
}

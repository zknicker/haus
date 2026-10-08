import { humanTimezoneSchema } from '@haus/api/membership';

/**
 * The zone this device runs in, as the Server stores a human's timezone. A zone
 * the Server would refuse (some runtimes report `Etc/Unknown`) is left out, so
 * it never fails the identity sync it rides on.
 */
export function deviceTimezone(
    zone: string | undefined = Intl.DateTimeFormat().resolvedOptions().timeZone
): string | undefined {
    const parsed = humanTimezoneSchema.safeParse(zone);
    return parsed.success ? parsed.data : undefined;
}

export interface TimezoneOption {
    id: string;
    label: string;
}

/**
 * Every IANA zone the runtime knows, plus the current value and UTC, which some
 * runtimes leave out of their canonical list. Labels read as place names.
 */
export function timezoneOptions(current: string | null): TimezoneOption[] {
    const zones = new Set(Intl.supportedValuesOf('timeZone'));
    zones.add('UTC');
    if (current) {
        zones.add(current);
    }
    return [...zones]
        .sort((left, right) => left.localeCompare(right))
        .map((id) => ({ id, label: id.replaceAll('_', ' ') }));
}

/**
 * The picker's search matcher. React Aria's Autocomplete filters only when
 * given one; `New_York` and `new york` both find `America/New York`.
 */
export function matchesTimezoneSearch(label: string, input: string): boolean {
    const normalize = (value: string) => value.replaceAll('_', ' ').trim().toLowerCase();
    return normalize(label).includes(normalize(input));
}

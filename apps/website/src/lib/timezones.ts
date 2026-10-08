/** The zone this device runs in, as the Server stores a human's timezone. */
export function deviceTimezone(): string | undefined {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone.length > 0 ? zone : undefined;
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

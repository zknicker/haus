/**
 * The canonical spelling of an IANA zone name, such as `America/New_York` or
 * `UTC`, or null when the value is not one. Offsets like `+05:00` are refused
 * even though `Intl` formats in them: they carry no DST rule, so a wall-clock
 * agreement in one would drift. Case is canonicalized through `Intl`'s
 * resolved name, so `america/new_york` stores as `America/New_York`.
 */
export function canonicalIanaTimezone(value: string): string | null {
    let resolved: string;
    try {
        resolved = new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).resolvedOptions()
            .timeZone;
    } catch {
        return null;
    }
    return ianaNamePattern.test(resolved) ? resolved : null;
}

const ianaNamePattern = /^[A-Za-z][A-Za-z_]*(?:\/[A-Za-z0-9_+-]+)*$/;

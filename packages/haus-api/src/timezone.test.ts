import { expect, test } from 'bun:test';
import { canonicalIanaTimezone } from './timezone.ts';

test('accepts IANA zone names and canonicalizes their case', () => {
    expect(canonicalIanaTimezone('America/New_York')).toBe('America/New_York');
    expect(canonicalIanaTimezone('america/new_york')).toBe('America/New_York');
    expect(canonicalIanaTimezone('UTC')).toBe('UTC');
    expect(canonicalIanaTimezone('utc')).toBe('UTC');
    expect(canonicalIanaTimezone('Etc/GMT+5')).toBe('Etc/GMT+5');
});

test('refuses offsets and unknown names', () => {
    expect(canonicalIanaTimezone('+05:00')).toBeNull();
    expect(canonicalIanaTimezone('-0800')).toBeNull();
    expect(canonicalIanaTimezone('Eastern')).toBeNull();
    expect(canonicalIanaTimezone('')).toBeNull();
});

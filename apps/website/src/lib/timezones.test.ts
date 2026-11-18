import { expect, test } from 'bun:test';
import { deviceTimezone, matchesTimezoneSearch, timezoneOptions } from './timezones.ts';

test('the device zone is the runtime zone the Server stores', () => {
    expect(deviceTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('a device zone the Server would refuse is left out of the identity sync', () => {
    expect(deviceTimezone('Etc/Unknown')).toBeUndefined();
    expect(deviceTimezone('')).toBeUndefined();
});

test('options cover every runtime zone, UTC, and a stored value the runtime omits', () => {
    const options = timezoneOptions('Etc/GMT+5');
    const ids = options.map((option) => option.id);
    expect(ids).toContain('America/New_York');
    expect(ids).toContain('UTC');
    expect(ids).toContain('Etc/GMT+5');
    expect(new Set(ids).size).toBe(ids.length);
    expect(options.find((option) => option.id === 'America/New_York')?.label).toBe(
        'America/New York'
    );
});

test('the picker search narrows zones by place name, ignoring case and underscores', () => {
    const labels = timezoneOptions(null).map((option) => option.label);
    const matches = (input: string) =>
        labels.filter((label) => matchesTimezoneSearch(label, input));
    expect(matches('new york')).toEqual(['America/New York']);
    expect(matches('New_York')).toEqual(['America/New York']);
    expect(matches('')).toHaveLength(labels.length);
});

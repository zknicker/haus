import { expect, test } from 'bun:test';
import { deviceTimezone, timezoneOptions } from './timezones.ts';

test('the device zone is the runtime zone the Server stores', () => {
    expect(deviceTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
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

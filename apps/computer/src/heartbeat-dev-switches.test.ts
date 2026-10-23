import { expect, test } from 'bun:test';
import type { AttachmentConnectionWork } from './attachment-connection-work.ts';
import { heartbeatQuietHoursSwitch, heartbeatScheduleSwitch } from './heartbeat-dev-switches.ts';
import { type HeartbeatScheduleInput, startHeartbeatSchedule } from './heartbeat-schedule.ts';

test('both switches default to on and accept only on or off', () => {
    expect(heartbeatQuietHoursSwitch({})).toBe('on');
    expect(heartbeatScheduleSwitch({})).toBe('on');
    expect(heartbeatQuietHoursSwitch({ HAUS_HEARTBEAT_QUIET_HOURS: 'off' })).toBe('off');
    expect(heartbeatScheduleSwitch({ HAUS_HEARTBEAT_SCHEDULE: 'off' })).toBe('off');
    expect(heartbeatScheduleSwitch({ HAUS_HEARTBEAT_SCHEDULE: 'on' })).toBe('on');
    for (const bad of ['', 'OFF', '0', 'false']) {
        expect(() => heartbeatQuietHoursSwitch({ HAUS_HEARTBEAT_QUIET_HOURS: bad })).toThrow(
            'HAUS_HEARTBEAT_QUIET_HOURS must be "on" or "off"'
        );
        expect(() => heartbeatScheduleSwitch({ HAUS_HEARTBEAT_SCHEDULE: bad })).toThrow(
            'HAUS_HEARTBEAT_SCHEDULE must be "on" or "off"'
        );
    }
});

test('the schedule loop starts unless the schedule switch is off', () => {
    let loops = 0;
    const work = {
        startLoop: () => {
            loops += 1;
        },
    } as unknown as AttachmentConnectionWork;
    const input = {} as Omit<HeartbeatScheduleInput, 'handled'>;

    startHeartbeatSchedule(work, input, { HAUS_HEARTBEAT_SCHEDULE: 'off' });
    expect(loops).toBe(0);

    startHeartbeatSchedule(work, input, {});
    expect(loops).toBe(1);
});

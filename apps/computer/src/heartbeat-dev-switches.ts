// Dev and test switches that make heartbeat runs time-independent (specs/heartbeat.md,
// docs/operations/environment.md). Production never sets them; unset means "on".

export type HeartbeatSwitch = 'off' | 'on';

type Environment = Readonly<Record<string, string | undefined>>;

/** `HAUS_HEARTBEAT_QUIET_HOURS=off`: report runs always take the daytime branch. */
export function heartbeatQuietHoursSwitch(environment: Environment = process.env): HeartbeatSwitch {
    return readSwitch('HAUS_HEARTBEAT_QUIET_HOURS', environment);
}

/** `HAUS_HEARTBEAT_SCHEDULE=off`: the Computer's schedule loop does not start. */
export function heartbeatScheduleSwitch(environment: Environment = process.env): HeartbeatSwitch {
    return readSwitch('HAUS_HEARTBEAT_SCHEDULE', environment);
}

function readSwitch(name: string, environment: Environment): HeartbeatSwitch {
    const value = environment[name];
    if (value === undefined || value === 'on') {
        return 'on';
    }
    if (value === 'off') {
        return 'off';
    }
    throw new Error(`${name} must be "on" or "off", got "${value}".`);
}

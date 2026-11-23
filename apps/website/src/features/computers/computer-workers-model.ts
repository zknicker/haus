export const workersDescription =
    'Captains can run unattended Claude Code or Codex Workers here under this device’s logins, up to the limit at once. Only the person who attached it can turn this on.';

const presetLimits = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20];

export function workerLimitOptions(current: number) {
    return [...new Set([...presetLimits, current])].sort((a, b) => a - b);
}

export function workersSwitchEnabled(computer: {
    canChangeWorkers: boolean;
    canEnableWorkers: boolean;
    workersEnabled: boolean;
}) {
    return computer.workersEnabled ? computer.canChangeWorkers : computer.canEnableWorkers;
}

export const computerServiceLabel = 'com.haus.computer';

interface LaunchdService {
    domain: string;
    label: string;
    plistPath: string;
    run(args: string[]): number;
}

/** launchd names every process it spawns for a job, and children inherit the name. */
export function runsInsideLaunchdJob(label: string, env: Record<string, string | undefined>) {
    return env.XPC_SERVICE_NAME === label;
}

/** Reloads the job definition. Only safe from outside the job's process group. */
export function replaceLaunchdService(input: LaunchdService) {
    const bootoutExitCode = input.run(['bootout', input.domain, input.plistPath]);
    if (bootoutExitCode !== 0 && input.run(['print', `${input.domain}/${input.label}`]) === 0) {
        throw new Error('Could not replace Haus Computer service.');
    }
    if (input.run(['bootstrap', input.domain, input.plistPath]) !== 0) {
        throw new Error('Could not start Haus Computer service.');
    }
}

export function restartLaunchdService(input: LaunchdService & { insideJob: boolean }) {
    if (!input.insideJob) {
        replaceLaunchdService(input);
        return;
    }
    // bootout from inside the job reaps this process group before bootstrap runs, leaving the
    // service unloaded. kickstart -k restarts in place; on success it also kills this caller.
    if (input.run(['kickstart', '-k', `${input.domain}/${input.label}`]) !== 0) {
        throw new Error('Could not restart Haus Computer service.');
    }
}

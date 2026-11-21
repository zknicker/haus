import { randomBytes } from 'node:crypto';

const runnerTokenBytes = 32;
const inheritedNames = ['HOME', 'LANG', 'PATH', 'SHELL', 'TMPDIR', 'USER'];

export function createRunnerToken() {
    return randomBytes(runnerTokenBytes).toString('base64url');
}

export function createRunnerServerEnvironment(serverEnvironment, runnerToken) {
    return { ...serverEnvironment, HAUS_RUNNER_TOKEN: runnerToken };
}

export function createRunnerProcessEnvironment({
    runnerDataRoot,
    runnerToken,
    serverUrl,
    startupEnvironment,
}) {
    const environment = {
        HAUS_RUNNER_DATA_DIR: runnerDataRoot,
        HAUS_RUNNER_TOKEN: runnerToken,
        HAUS_SERVER_URL: serverUrl,
    };
    for (const name of [...inheritedNames, 'HAUS_RUNNER_MAX_WARM']) {
        if (startupEnvironment[name]) {
            environment[name] = startupEnvironment[name];
        }
    }
    return environment;
}

import path from 'node:path';
import { createRunnerProcessEnvironment } from './dev-stack-runner-environment.mjs';
import { createDevStackStatePaths } from './dev-stack-shared.mjs';

export function resolveRunnerDataRoot({ baseEnvironment, repositoryRoot }) {
    return (
        baseEnvironment.HAUS_RUNNER_DATA_DIR ??
        path.join(
            createDevStackStatePaths({ baseEnvironment, repositoryRoot }).appStateRoot,
            'runner'
        )
    );
}

export function createRunnerSpawnOptions({
    repositoryRoot,
    runnerDataRoot,
    runnerToken,
    serverUrl,
    startupEnvironment,
}) {
    return {
        cwd: path.join(repositoryRoot, 'apps', 'runner'),
        env: createRunnerProcessEnvironment({
            runnerDataRoot,
            runnerToken,
            serverUrl,
            startupEnvironment,
        }),
    };
}

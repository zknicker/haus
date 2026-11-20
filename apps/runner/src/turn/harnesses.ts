import { createClaudeHarness } from '../claude/claude-driver.ts';
import { setupTokenEnvironment } from '../claude/claude-launch.ts';
import type { RunnerConfig } from '../config.ts';
import type { LoginConfig } from '../logins.ts';
import { openFileCredentialStore, piLoginsDir } from '../pi/pi-credentials.ts';
import { createPiHarness } from '../pi/pi-driver.ts';
import { createPiModels } from '../pi/pi-models.ts';
import { harnessFor, type RuntimeDriverFactory } from './runtime-driver.ts';

export function createHarnesses(
    config: LoginConfig & Pick<RunnerConfig, 'maxWarm'>,
    log: (line: string) => void
) {
    const claude = createClaudeHarness({
        environment: setupTokenEnvironment(config.claudeSetupToken),
        maxWarm: config.maxWarm,
    });
    const pi = createPiHarness({
        log,
        maxWarm: config.maxWarm,
        models: createPiModels({
            apiKeys: config,
            credentials: openFileCredentialStore(piLoginsDir(config.dataDir)),
        }),
    });
    const factory: RuntimeDriverFactory = (launch) =>
        harnessFor(launch.modelId) === 'pi-durable' ? pi.factory(launch) : claude.factory(launch);
    return {
        close() {
            claude.close();
            return pi.close();
        },
        factory,
    };
}

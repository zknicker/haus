import { pathToFileURL } from 'node:url';
import { seedAgentWorkspace, seedCoveWorkspace } from '@haus/agent-workspace';
import { composeAgentInstructions } from './instructions.ts';

/** Explicit opt-in skew probe. Read a pinned old checkout; all writes stay in the fixture. */
export async function coveTestBootstrap(legacyRepo, ordinary) {
    if (!legacyRepo) {
        return {
            seed: ordinary
                ? (workspaceDir) =>
                      seedAgentWorkspace({
                          agentName: 'Orbit',
                          bio: 'Workstream assistant',
                          workspaceDir,
                      })
                : seedCoveWorkspace,
            compose: composeAgentInstructions,
            cli: new URL('../agent-cli.ts', import.meta.url).href,
            legacy: false,
        };
    }
    const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: legacyRepo });
    if (
        revision.exitCode !== 0 ||
        revision.stdout.toString().trim() !== 'd031dd7e00bd59d26883bb0c7f4ae9a1ea4e6530'
    ) {
        throw new Error('Legacy Cove probe requires the untouched d031 checkout.');
    }
    const source = (file) => pathToFileURL(`${legacyRepo}/${file}`).href;
    return {
        seed: (await import(source('packages/agent-workspace/src/cove-starter-kit.ts')))
            .seedCoveWorkspace,
        compose: (await import(source('apps/computer/src/harness/instructions.ts')))
            .composeAgentInstructions,
        cli: source('apps/computer/src/agent-cli.ts'),
        legacy: true,
    };
}

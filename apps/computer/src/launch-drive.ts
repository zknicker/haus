import { mkdir } from 'node:fs/promises';
import { readAgentSeedConfiguration } from './agent-configuration.ts';
import { driveMemoryTraceLine, prepareAgentDrive } from './drive-migration/prepare-agent-drive.ts';
import { ensureNativeSkillLinks } from './harness/native-skill-links.ts';
import { driveFolderFailureReport } from './launch-failure-turns.ts';
import { messageOf, writeTrace } from './launch-trace.ts';
import type { RunAgentLaunchOptions } from './launch.ts';
import { seedAgentManagedSkills } from './managed-skill-changes.ts';
import { revokeRunner } from './runner-authority.ts';

export async function prepareLaunchDrive(input: {
    agentRoot: string;
    dirs: { home: string; runtime: string };
    options: RunAgentLaunchOptions;
    runner: { runnerId: string; runnerToken: string };
    startedAt: string;
}) {
    const { command } = input.options;
    const trace = { command, dirs: input.dirs };
    try {
        const prepared = await prepareAgentDrive({
            agentId: command.agentId,
            agentRoot: input.agentRoot,
            handle: command.agentName,
            runnerToken: input.runner.runnerToken,
            seed: (await readAgentSeedConfiguration(input.agentRoot)) ?? {
                agentDescription: command.agentDescription ?? null,
                agentName: command.agentName,
                brief: null,
                briefAuthorHandle: null,
                factoryKind: 'ordinary',
            },
            serverOrigin: input.options.serverOrigin,
        });
        if (prepared.moved > 0) {
            await writeTrace(trace, driveMemoryTraceLine(prepared.drive, prepared.memory));
        }
        await mkdir(prepared.drive.skills, { mode: 0o755, recursive: true });
        await seedAgentManagedSkills(input.agentRoot, prepared.drive.skills);
        await ensureNativeSkillLinks(input.dirs.home, prepared.drive.skills);
        return { drive: prepared.drive, ok: true } as const;
    } catch (error) {
        await writeTrace(trace, `Drive preparation failed: ${messageOf(error)}\n`);
        await revokeRunner(input.options, input.runner.runnerId).catch(() => undefined);
        return { ok: false, report: driveFolderFailureReport(error, input.startedAt) } as const;
    }
}

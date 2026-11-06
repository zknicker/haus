import { describe, expect, test } from 'bun:test';
import { unlinkSync, writeFileSync } from 'node:fs';

const biomeTimeoutMs = 30_000;
const diagnostic = 'Cloud Agent status written outside the Run lifecycle';

/** Biome skips plugins for stdin input, so the probe is a real file it lints. */
function lint(source: string): string {
    const probe = `apps/server/lint/probe-${crypto.randomUUID()}.ts`;
    writeFileSync(probe, source);
    try {
        const run = Bun.spawnSync(['bun', 'x', 'biome', 'lint', probe], {
            stderr: 'pipe',
            stdout: 'pipe',
        });
        return `${run.stdout.toString()}${run.stderr.toString()}`;
    } finally {
        unlinkSync(probe);
    }
}

describe('cloud-agent-status-writes lint rule', () => {
    const invalid = [
        "await db.update(cloudAgentRunsTable).set({ status: 'failed' });",
        "await tx.update(cloudAgentWorkTable).set({ status: 'queued', updatedAt: now });",
        'await tx.update(cloudAgentWorkTable).set({ status, updatedAt: now });',
    ];
    const valid = [
        'await db.update(cloudAgentWorkTable).set({ updatedAt: now });',
        'await db.update(cloudAgentRunsTable).set(runObservationUpdate(observation));',
        'await tx.update(cloudAgentWorkTable).set({ ...projectCloudAgentWork(run), updatedAt });',
        "await db.update(tasksTable).set({ status: 'done' });",
    ];

    test(
        'rejects every literal status write',
        () => {
            expect(lint(invalid.join('\n')).split(diagnostic).length - 1).toBe(invalid.length);
        },
        biomeTimeoutMs
    );

    test(
        'allows spread lifecycle writes and other tables',
        () => {
            expect(lint(valid.join('\n'))).not.toContain(diagnostic);
        },
        biomeTimeoutMs
    );
});

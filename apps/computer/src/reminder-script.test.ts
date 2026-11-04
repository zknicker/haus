import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cause, Effect, Runtime } from 'effect';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import {
    parseReminderScriptCommand,
    runReminderScript,
    runReminderScriptWithExecution,
} from './reminder-script.ts';
import { ReminderScriptExecutionFailure } from './reminder-script-execution.ts';
import { secretsPaths } from './secrets/store.ts';

let dataRoot: string;
const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-reminder-script-'));
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

test('runs a reminder script once in the Agent workspace and replays its result', async () => {
    const command = parseReminderScriptCommand({
        agentId: 'agt_reminder',
        attentionId: 'rma_reminder',
        fireId: 'rmf_reminder',
        reminderId: 'rmd_reminder',
        script: 'printf first; printf marker > marker.txt',
        type: 'reminder-script',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }

    const first = await runReminderScript({ command, dataRoot, runtime, serverId: 'srv_reminder' });
    expect(first).toMatchObject({ exitCode: 0, output: 'first', timedOut: false });
    const marker = join(
        dataRoot,
        'servers',
        'srv_reminder',
        'agents',
        'agt_reminder',
        'workspace',
        'marker.txt'
    );
    expect(await readFile(marker, 'utf8')).toBe('marker');

    const second = await runReminderScript({
        command: { ...command, script: 'printf second; printf changed > marker.txt' },
        dataRoot,
        runtime,
        serverId: 'srv_reminder',
    });
    expect(second).toEqual(first);
    expect(await readFile(marker, 'utf8')).toBe('marker');
});

test('coalesces concurrent delivery of the same reminder script', async () => {
    const command = parseReminderScriptCommand({
        agentId: 'agt_concurrent',
        attentionId: 'rma_concurrent',
        fireId: 'rmf_concurrent',
        reminderId: 'rmd_concurrent',
        script: 'printf x >> executions.txt; sleep 0.05; printf done',
        type: 'reminder-script',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }

    const [first, second] = await Promise.all([
        runReminderScript({ command, dataRoot, runtime, serverId: 'srv_concurrent' }),
        runReminderScript({ command, dataRoot, runtime, serverId: 'srv_concurrent' }),
    ]);

    expect(second).toEqual(first);
    expect(
        await readFile(
            join(
                dataRoot,
                'servers',
                'srv_concurrent',
                'agents',
                'agt_concurrent',
                'workspace',
                'executions.txt'
            ),
            'utf8'
        )
    ).toBe('x');
});

test('runs with a minimal environment instead of Computer process secrets', async () => {
    const prior = process.env.HAUS_REMINDER_TEST_SECRET;
    process.env.HAUS_REMINDER_TEST_SECRET = 'must-not-leak';
    try {
        const command = parseReminderScriptCommand({
            agentId: 'agt_environment',
            attentionId: 'att_environment0001',
            fireId: 'rmf_environment',
            reminderId: 'rmd_environment',
            script: `printf '%s\\n%s\\n%s' "$HAUS_REMINDER_TEST_SECRET" "$HOME" "$(command -v sh)"`,
            type: 'reminder-script',
        });
        if (!command) {
            throw new Error('Fixture command did not parse.');
        }
        const serverId = 'srv_environment';
        const result = await runReminderScript({ command, dataRoot, runtime, serverId });

        expect(result.output).not.toContain('must-not-leak');
        expect(result.output).toContain(
            join(dataRoot, 'servers', serverId, 'agents', command.agentId, 'home')
        );
        expect(result.output).toMatch(/\/sh$/mu);
    } finally {
        if (prior === undefined) {
            process.env.HAUS_REMINDER_TEST_SECRET = undefined;
        } else {
            process.env.HAUS_REMINDER_TEST_SECRET = prior;
        }
    }
});

test("puts the Owner's haus-secrets on PATH, like the Agent's own shell commands get", async () => {
    const serverId = 'srv_secrets_path';
    const { binDir, wrapper } = secretsPaths(dataRoot, serverId);
    await mkdir(binDir, { mode: 0o700, recursive: true });
    await writeFile(wrapper, '#!/bin/sh\nprintf found\n', { mode: 0o700 });
    await chmod(wrapper, 0o700);
    const command = parseReminderScriptCommand({
        agentId: 'agt_secrets_path',
        attentionId: 'att_secrets_path0001',
        fireId: 'rmf_secrets_path',
        reminderId: 'rmd_secrets_path',
        script: 'haus-secrets',
        type: 'reminder-script',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }

    const result = await runReminderScript({ command, dataRoot, runtime, serverId });

    expect(result).toMatchObject({ exitCode: 0, output: 'found' });
});

test('reports how long the script ran', async () => {
    const command = parseReminderScriptCommand({
        agentId: 'agt_duration',
        attentionId: 'att_duration00000001',
        fireId: 'rmf_duration',
        reminderId: 'rmd_duration',
        script: 'sleep 0.05',
        type: 'reminder-script',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }

    const result = await runReminderScript({
        command,
        dataRoot,
        runtime,
        serverId: 'srv_duration',
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(40);
});

test('bounds combined multibyte output by UTF-8 bytes', async () => {
    const command = parseReminderScriptCommand({
        agentId: 'agt_multibyte',
        attentionId: 'att_multibyte000001',
        fireId: 'rmf_multibyte',
        reminderId: 'rmd_multibyte',
        script: `printf '🙂%.0s' {1..30000}`,
        type: 'reminder-script',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }

    const result = await runReminderScript({
        command,
        dataRoot,
        runtime,
        serverId: 'srv_multibyte',
    });
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(65_536);
    expect(result.output.endsWith('🙂')).toBe(true);
});

test('does not persist a marker when scoped execution fails', async () => {
    const command = reminderCommand('att_spawn_failure');
    const failure = new ReminderScriptExecutionFailure({
        cause: new Error('spawn failed'),
        operation: 'process-spawn',
    });
    await expect(
        runReminderScriptWithExecution(
            { command, dataRoot, runtime, serverId: 'srv_spawn_failure' },
            () => Effect.fail(failure)
        )
    ).rejects.toBe(failure);
    await expect(
        readFile(
            join(
                dataRoot,
                'servers',
                'srv_spawn_failure',
                'agents',
                command.agentId,
                'runtime',
                'reminder-results',
                `${command.attentionId}.json`
            ),
            'utf8'
        )
    ).rejects.toThrow();
});

test('maps interrupted execution to an ordinary Error rejection', async () => {
    const command = reminderCommand('att_interrupted');
    await expect(
        runReminderScriptWithExecution(
            { command, dataRoot, runtime, serverId: 'srv_interrupted' },
            () => Effect.interrupt
        )
    ).rejects.toBeInstanceOf(Error);
    await expect(
        readFile(
            join(
                dataRoot,
                'servers',
                'srv_interrupted',
                'agents',
                command.agentId,
                'runtime',
                'reminder-results',
                `${command.attentionId}.json`
            ),
            'utf8'
        )
    ).rejects.toThrow();
});

test('retains a composite execution Cause when a concurrent branch defects', async () => {
    const command = reminderCommand('att_composite_failure');
    const failure = new ReminderScriptExecutionFailure({
        cause: new Error('stdout failed'),
        operation: 'process-settlement',
    });
    const defect = new Error('stderr defect');
    try {
        await runReminderScriptWithExecution(
            { command, dataRoot, runtime, serverId: 'srv_composite_failure' },
            () =>
                Effect.all([Effect.fail(failure), Effect.die(defect)], {
                    concurrency: 'unbounded',
                }).pipe(Effect.as({ exitCode: 0, output: '', timedOut: false }))
        );
        throw new Error('Expected reminder execution to fail.');
    } catch (error) {
        expect(Runtime.isFiberFailure(error)).toBe(true);
        if (Runtime.isFiberFailure(error)) {
            const rendered = Cause.pretty(error[Runtime.FiberFailureCauseId]);
            expect(rendered).toContain(failure.message);
            expect(rendered).toContain(defect.message);
        }
    }
});

function reminderCommand(attentionId: string) {
    const command = parseReminderScriptCommand({
        agentId: 'agt_spawn_failure',
        attentionId,
        fireId: 'rmf_spawn_failure',
        reminderId: 'rmd_spawn_failure',
        script: 'printf ignored',
        type: 'reminder-script',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }
    return command;
}

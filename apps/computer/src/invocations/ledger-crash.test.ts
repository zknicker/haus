import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';
import { createLedger } from './ledger.ts';

const hostPath = new URL('./handler-host.test-support.ts', import.meta.url).pathname;
const unknownText =
    'The machine lost this command before it reported a result. It may or may not have run; check its effects before running it again.';

let root: string;
let agentsRoot: string;
let counter: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-ledger-crash-'));
    agentsRoot = join(root, 'servers', 'server-1', 'agents');
    counter = join(root, 'counter');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

describe('a crash after accepting', () => {
    test('a host killed mid-command reports unknown on restart and never runs it again', async () => {
        const frame = invoke(`printf 'ran\\n' >> ${counter}; kill -9 $PPID`);

        const crashed = await runHost([frame]);
        expect(crashed.signalCode).toBe('SIGKILL');
        expect(crashed.frames).toEqual([{ invocationId: 'inv-1', type: 'invoke-accepted' }]);

        const restarted = await runHost([frame]);
        expect(restarted.signalCode).toBeNull();
        expect(restarted.frames).toEqual([
            { invocationId: 'inv-1', type: 'invoke-accepted' },
            unknownResult('inv-1'),
        ]);
        expect(await readFile(counter, 'utf8')).toBe('ran\n');
    });

    test('an accepted record whose command never started reports unknown and runs nothing', async () => {
        await createLedger(agentsRoot).write(acceptedRecord());
        const frames: unknown[] = [];
        const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

        handler.receive(invoke(`printf 'ran\\n' >> ${counter}`));
        await handler.settled();

        expect(frames).toEqual([
            { invocationId: 'inv-1', type: 'invoke-accepted' },
            unknownResult('inv-1'),
        ]);
        expect(await Bun.file(counter).exists()).toBe(false);
    });

    test('unknown is terminal across acknowledgement, resend, and restart', async () => {
        await createLedger(agentsRoot).write(acceptedRecord());
        const frame = invoke(`printf 'ran\\n' >> ${counter}`);
        const first: unknown[] = [];
        const handler = await createInvocationHandler(handlerInput(agentsRoot, first));
        handler.receive(frame);
        handler.receive({ invocationId: 'inv-1', type: 'invoke-result-ack' });
        await handler.settled();
        handler.receive(frame);
        await handler.settled();

        const second: unknown[] = [];
        const restarted = await createInvocationHandler(handlerInput(agentsRoot, second));
        await restarted.connected();
        restarted.receive(frame);
        await restarted.settled();

        const answer = [{ invocationId: 'inv-1', type: 'invoke-accepted' }, unknownResult('inv-1')];
        expect(first).toEqual([...answer, ...answer]);
        expect(second).toEqual(answer);
        expect(await Bun.file(counter).exists()).toBe(false);
    });
});

async function runHost(frames: unknown[]) {
    const host = Bun.spawn(['bun', hostPath, agentsRoot], {
        stderr: 'inherit',
        stdin: 'pipe',
        stdout: 'pipe',
    });
    for (const frame of frames) {
        host.stdin.write(`${JSON.stringify(frame)}\n`);
    }
    await host.stdin.end();
    const output = await new Response(host.stdout).text();
    await host.exited;
    return {
        frames: output
            .split('\n')
            .filter((line) => line.length > 0)
            .map((line) => JSON.parse(line) as unknown),
        signalCode: host.signalCode,
    };
}

function invoke(command: string) {
    return {
        agentId: 'agent-1',
        invocationId: 'inv-1',
        notAfter: '2999-01-01T00:00:00.000Z',
        operation: { command, kind: 'bash' },
        runId: 'run-1',
        timeoutMs: 30_000,
        type: 'invoke',
    };
}

function acceptedRecord() {
    return {
        acceptedAt: '2026-11-19T12:00:00.000Z',
        agentId: 'agent-1',
        invocationId: 'inv-1',
        operationKind: 'bash' as const,
        runId: 'run-1',
        state: 'accepted' as const,
    };
}

function unknownResult(invocationId: string) {
    return {
        invocationId,
        outcome: 'unknown',
        output: { kind: 'text', text: unknownText },
        truncated: false,
        type: 'invoke-result',
    };
}

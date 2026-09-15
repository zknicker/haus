import { expect, test } from 'bun:test';
import { executeMcpCode, type McpExecution } from './execute.ts';
import { limits, readMessages } from './protocol.ts';

const command = {
    executable: process.execPath,
    args: [new URL('./worker.ts', import.meta.url).pathname],
};
const run = (code: string, input: Partial<Omit<McpExecution, 'code' | 'command'>> = {}) =>
    executeMcpCode({
        command,
        code,
        invoke: async ({ args }) => args,
        ...input,
    });

test('published Executor runs JavaScript and asynchronous host calls without host globals', async () => {
    expect(await run('return await tools.echo({value:42});')).toMatchObject({
        result: { value: 42 },
    });
    expect(await run('return {process:typeof process,require:typeof require};')).toMatchObject({
        result: { process: 'undefined', require: 'undefined' },
    });
    expect(await run('return await fetch("https://example.test");')).toHaveProperty('error');
});

test('cancellation kills infinite loops and prevents a later dispatch after a hanging call', async () => {
    for (const code of [
        'while(true){}',
        'await tools.hang({}); await tools.late({});',
        'tools.hang({}); while(true){}',
    ]) {
        const signal = AbortSignal.timeout(300);
        const called: string[] = [];
        await expect(
            run(code, {
                signal,
                invoke: ({ path, signal: callSignal }) => {
                    called.push(path);
                    return new Promise((_resolve, reject) =>
                        callSignal.addEventListener('abort', () => reject(callSignal.reason), {
                            once: true,
                        })
                    );
                },
            })
        ).rejects.toThrow();
        expect(called).not.toContain('late');
    }
    expect(await run('return 7;')).toMatchObject({ result: 7 });
});

test('pre-aborted execution never dispatches', async () => {
    let calls = 0;
    await expect(
        run('return await tools.call({});', {
            signal: AbortSignal.abort(),
            invoke: async () => {
                calls += 1;
            },
        })
    ).rejects.toThrow();
    expect(calls).toBe(0);
});

test('bounds code, output, and host call count', async () => {
    await expect(run(' '.repeat(limits.codeBytes + 1))).rejects.toThrow('code size');
    const output = await run(`return 'x'.repeat(${limits.messageBytes + 1});`).catch(String);
    expect(JSON.stringify(output)).toContain('limit');
    let calls = 0;
    await run('for(let i=0;i<100;i++) await tools.echo({}); return true;', {
        invoke: async () => {
            calls += 1;
            return null;
        },
    }).catch(() => undefined);
    expect(calls).toBe(limits.calls);
});

test('protocol caps an unterminated stream before accumulating a full line', async () => {
    async function* oversized() {
        yield Buffer.alloc(limits.messageBytes, 32);
        yield Buffer.from('x');
    }
    await expect(Array.fromAsync(readMessages(oversized()))).rejects.toThrow('message size');
});

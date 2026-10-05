import { afterEach, expect, spyOn, test } from 'bun:test';
import { runAgentCli } from './agent-cli.ts';

const families = [
    'agent',
    'attachment',
    'channel',
    'cloud-agent',
    'inbox',
    'message',
    'profile',
    'reminder',
    'server',
    'skill',
    'task',
    'thread',
    'trigger',
] as const;

let restore: (() => void) | null = null;

afterEach(() => {
    restore?.();
    restore = null;
});

test('every command family help ends with its Manual topic pointer', async () => {
    for (const family of families) {
        const output = await captureStdout(() => runAgentCli([family, '--help']));
        expect(output.trimEnd().split('\n').at(-1)).toStartWith(
            `Details: haus manual get ${family} --intent`
        );
    }
});

test('subcommand help carries the same Manual pointer', async () => {
    const output = await captureStdout(() => runAgentCli(['reminder', 'schedule', '--help']));
    expect(output.trimEnd().split('\n').at(-1)).toStartWith('Details: haus manual get reminder');
});

test('manual help shows example flows and points at the index', async () => {
    const output = await captureStdout(() => runAgentCli(['manual', '--help']));
    expect(output).toContain('Examples:');
    expect(output).toContain('haus manual get reminder --intent');
    expect(output).toContain('haus manual search "claim task"');
    expect(output.trimEnd().split('\n').at(-1)).toStartWith('Details: haus manual get index');
});

async function captureStdout(run: () => Promise<number>): Promise<string> {
    let output = '';
    const spy = spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        output += String(chunk);
        return true;
    });
    restore = () => spy.mockRestore();
    expect(await run()).toBe(0);
    return output;
}

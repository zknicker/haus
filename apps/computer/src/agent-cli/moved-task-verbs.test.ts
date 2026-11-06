import { afterEach, expect, spyOn, test } from 'bun:test';
import { runAgentCli } from '../agent-cli.ts';

const flags = '--target <target> --number <n>';
const tail = '`haus task` is now board Tasks.';

let restore: (() => void) | null = null;

afterEach(() => {
    restore?.();
    restore = null;
});

test.each([
    ['claim', 'haus claim'],
    ['unclaim', 'haus claim release'],
    ['unassign', 'haus claim unassign'],
])('haus task %s still fails and names %s', async (verb, replacement) => {
    const stderr = captureStderr();

    expect(await runAgentCli(['task', verb, '--target', '#general', '--number', '7'])).toBe(2);

    expect(stderr()).toContain(`Unknown task command '${verb}'.`);
    expect(stderr()).toContain(`Claims moved: use \`${replacement} ${flags}\`. ${tail}\n`);
});

test.each([
    [['task', 'claimm']],
    [['claim', 'claim']],
    [['claim', 'unclaim']],
    [['board', 'claim']],
])('%j gets no moved-claims line', async (argv) => {
    const stderr = captureStderr();

    expect(await runAgentCli(argv)).toBe(2);

    expect(stderr()).toContain('Unknown ');
    expect(stderr()).not.toContain('Claims moved');
});

function captureStderr(): () => string {
    let output = '';
    const spy = spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
        output += String(chunk);
        return true;
    });
    restore = () => spy.mockRestore();
    return () => output;
}

import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    launchNativeClaudeCloud,
    terminalTail,
    writeClaudeEnvironmentPin,
} from './native-commands.ts';

const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

async function checkout(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-launch-'));
    roots.push(root);
    return root;
}

test("a failed launch keeps Claude's last words readable", () => {
    const output = [
        '\u001b[?25l\u001b[2GQuick\u001b[8Gsafety\u001b[15Gcheck\r\n',
        '\u001b[1A\u001b[2K',
        '\u001b[31mError: no cloud environment is available\u001b[39m\r\n',
    ].join('');

    expect(terminalTail(output)).toBe(
        'Quick safety check\nError: no cloud environment is available'
    );
});

test('a long transcript keeps only its last lines', () => {
    const output = Array.from({ length: 50 }, (_, line) => `line ${line}`).join('\n');

    const tail = terminalTail(output).split('\n');

    expect(tail).toHaveLength(20);
    expect(tail.at(-1)).toBe('line 49');
});

test('a silent launcher says so', () => {
    expect(terminalTail('\u001b[?25h\r\n')).toBe('(no output)');
});

test('the environment pin writes the setting Claude Code reads', async () => {
    const cwd = await checkout();

    await writeClaudeEnvironmentPin(cwd, 'env_bidbeacon');

    expect(JSON.parse(await readFile(join(cwd, '.claude', 'settings.local.json'), 'utf8'))).toEqual(
        { remote: { defaultEnvironmentId: 'env_bidbeacon' } }
    );
});

test('a launch with a pinned environment writes the settings file before the launcher starts', async () => {
    const cwd = await checkout();

    await launchNativeClaudeCloud({
        cwd,
        environmentId: 'env_bidbeacon',
        modelId: null,
        prompt: 'test',
        signal: AbortSignal.timeout(10),
    }).catch(() => undefined);

    expect(JSON.parse(await readFile(join(cwd, '.claude', 'settings.local.json'), 'utf8'))).toEqual(
        { remote: { defaultEnvironmentId: 'env_bidbeacon' } }
    );
});

test('an unpinned launch writes no settings file', async () => {
    const cwd = await checkout();

    await launchNativeClaudeCloud({
        cwd,
        environmentId: null,
        modelId: null,
        prompt: 'test',
        signal: AbortSignal.timeout(10),
    }).catch(() => undefined);

    await expect(readFile(join(cwd, '.claude', 'settings.local.json'), 'utf8')).rejects.toThrow();
});

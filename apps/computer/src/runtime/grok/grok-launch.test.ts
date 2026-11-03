import { afterAll, expect, test } from 'bun:test';
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readlink,
    realpath,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRuntimeResumeRejection } from '../resume-rejected.ts';
import {
    GROK_INSTRUCTION_COMPAT_ENV,
    grokLaunchAllowsAutoApproval,
    grokLaunchArgs,
    grokLaunchEnv,
    prepareGrokHome,
} from './grok-launch.ts';
import { grokResumeSessionId, grokResumeState } from './grok-resume.ts';

const roots: string[] = [];
afterAll(() => Promise.all(roots.map((root) => rm(root, { force: true, recursive: true }))));

test('Grok launches with vendor instruction and MCP sources off, sub-agents and questions off', () => {
    const env = grokLaunchEnv({
        credentialEnv: { XAI_API_KEY: 'k' },
        env: { GROK_SUBAGENTS: '1', PATH: '/haus/bin' },
        homeDir: '/agents/a/home',
    });

    expect(env).toMatchObject({
        ...GROK_INSTRUCTION_COMPAT_ENV,
        GROK_ASK_USER_QUESTION: 'false',
        GROK_CLAUDE_MCPS_ENABLED: 'false',
        GROK_CODEX_MCPS_ENABLED: 'false',
        GROK_CURSOR_MCPS_ENABLED: 'false',
        GROK_HOME: '/agents/a/home/.grok',
        GROK_MANAGED_MCPS_ENABLED: 'false',
        GROK_MAX_MCP_OUTPUT_BYTES: '102400',
        GROK_SUBAGENTS: '0',
        HOME: '/agents/a/home',
        PATH: '/haus/bin',
        XAI_API_KEY: 'k',
    });
});

test('launch argv: no leader, always-approve, and the reasoning effort unless default', () => {
    expect(grokLaunchArgs('high')).toEqual([
        'agent',
        '--no-leader',
        '--always-approve',
        '--reasoning-effort',
        'high',
        'stdio',
    ]);
    expect(grokLaunchArgs('default')).toEqual([
        'agent',
        '--no-leader',
        '--always-approve',
        'stdio',
    ]);
});

// Ported from botiverse/raft-source packages/daemon/src/drivers/grok.test.ts (FSL-1.1-ALv2)
test('permission auto-approval requires both launch and session yolo facts', () => {
    expect(
        grokLaunchAllowsAutoApproval(['agent', '--no-leader', '--always-approve', 'stdio'], {
            yoloMode: true,
        })
    ).toBe(true);
    expect(
        grokLaunchAllowsAutoApproval(['agent', '--no-leader', 'stdio'], { yoloMode: true })
    ).toBe(false);
    expect(
        grokLaunchAllowsAutoApproval(['agent', '--no-leader', '--always-approve', 'stdio'], {
            yoloMode: false,
        })
    ).toBe(false);
});

test('installs instructions owner-only and links the host Grok login into the Agent HOME', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-grok-launch-')));
    roots.push(root);
    const hostGrokHomeDir = join(root, 'host', '.grok');
    await mkdir(hostGrokHomeDir, { recursive: true });
    await writeFile(join(hostGrokHomeDir, 'auth.json'), '{}');
    const homeDir = join(root, 'home');

    await prepareGrokHome({
        homeDir,
        hostGrokHomeDir,
        hostHomeDir: join(root, 'host'),
        instructions: 'Be Haus.\n',
    });

    const agents = join(homeDir, '.grok', 'AGENTS.md');
    expect(await readFile(agents, 'utf8')).toBe('Be Haus.\n');
    expect((await stat(agents)).mode & 0o777).toBe(0o600);
    expect((await lstat(join(homeDir, '.grok', 'auth.json'))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(homeDir, '.grok', 'auth.json'))).toBe(
        join(hostGrokHomeDir, 'auth.json')
    );
});

test('resumes a Haus Grok state and converts the AI SDK harness state it replaces', () => {
    expect(grokResumeSessionId(undefined)).toBeUndefined();
    expect(grokResumeSessionId(grokResumeState('01a1-grok'))).toBe('01a1-grok');
    expect(
        grokResumeSessionId({
            data: { acpSessionId: '01a1-legacy', implementationIdentity: 'x' },
            harnessId: 'grok-build',
            specificationVersion: 'harness-v1',
            type: 'resume-session',
        })
    ).toBe('01a1-legacy');
});

test('state another runtime wrote is a resume rejection, never a silent fresh session', () => {
    const foreign = () => grokResumeSessionId({ runtime: 'codex', threadId: 't', version: 1 });
    const legacyCodex = () =>
        grokResumeSessionId({
            data: { acpSessionId: 'c' },
            harnessId: 'codex',
            type: 'resume-session',
        });

    expect(foreign).toThrow();
    expect(legacyCodex).toThrow();
    for (const open of [foreign, legacyCodex]) {
        try {
            open();
        } catch (error) {
            expect(isRuntimeResumeRejection(error)).toBe(true);
        }
    }
});

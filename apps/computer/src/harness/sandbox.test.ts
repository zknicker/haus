import { afterAll, afterEach, expect, test } from 'bun:test';
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

const roots: string[] = [];
const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('provider credentials remain references to host-native auth, never copies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-sandbox-'));
    roots.push(root);
    const hostHomeDir = join(root, 'host');
    const hostGrokHomeDir = join(root, 'host-grok');
    const homeDir = join(root, 'agent-home');
    await mkdir(join(hostHomeDir, '.codex'), { recursive: true });
    await mkdir(join(hostHomeDir, '.claude'), { recursive: true });
    await mkdir(hostGrokHomeDir, { recursive: true });
    await writeFile(join(hostHomeDir, '.codex', 'auth.json'), '{"token":"codex-one"}');
    await writeFile(join(hostHomeDir, '.claude.json'), '{"token":"claude-one"}');
    await writeFile(join(hostHomeDir, '.claude', '.credentials.json'), '{"oauth":"one"}');
    await writeFile(join(hostGrokHomeDir, 'auth.json'), '{"token":"grok-one"}');

    const provider = createLocalTrustedSandboxProvider({
        authProfiles: ['codex', 'claude-code', 'grok-build'],
        homeDir,
        hostGrokHomeDir,
        hostHomeDir,
        rootDir: join(root, 'workspace'),
        runtime,
    });
    const session = await provider.createSession?.();
    if (!session) {
        throw new Error('Sandbox provider did not create a session.');
    }
    await session.destroy?.();

    const references = [
        join(homeDir, '.codex', 'auth.json'),
        join(homeDir, '.claude', '.credentials.json'),
        join(homeDir, '.grok', 'auth.json'),
    ];
    for (const reference of references) {
        expect((await lstat(reference)).isSymbolicLink()).toBe(true);
    }

    await writeFile(join(hostHomeDir, '.codex', 'auth.json'), '{"token":"codex-two"}');
    expect(await readFile(join(homeDir, '.codex', 'auth.json'), 'utf8')).toContain('codex-two');
    expect(await realpath(join(homeDir, '.grok', 'auth.json'))).toBe(
        await realpath(join(hostGrokHomeDir, 'auth.json'))
    );
});

// The host `.claude.json` carries the operator's user MCP servers and per-project state.
// Claude login resolves from host credentials, so the Agent keeps its own file instead.
test('Claude Agent HOME drops the legacy host .claude.json link and keeps its own file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-sandbox-claude-json-'));
    roots.push(root);
    const hostHomeDir = join(root, 'host');
    const linkedHome = join(root, 'linked-home');
    const ownedHome = join(root, 'owned-home');
    await mkdir(hostHomeDir, { recursive: true });
    await mkdir(linkedHome, { recursive: true });
    await mkdir(ownedHome, { recursive: true });
    await writeFile(join(hostHomeDir, '.claude.json'), '{"mcpServers":{"operator":{}}}');
    await symlink(join(hostHomeDir, '.claude.json'), join(linkedHome, '.claude.json'));
    await writeFile(join(ownedHome, '.claude.json'), '{"numStartups":3}');

    for (const homeDir of [linkedHome, ownedHome]) {
        const session = await createLocalTrustedSandboxProvider({
            authProfiles: ['claude-code'],
            homeDir,
            hostHomeDir,
            rootDir: join(root, 'workspace'),
            runtime,
        }).createSession?.();
        await session?.destroy?.();
    }

    expect(await exists(join(linkedHome, '.claude.json'))).toBe(false);
    expect(await readFile(join(ownedHome, '.claude.json'), 'utf8')).toBe('{"numStartups":3}');
});

test('restores native Codex image generation without changing other Codex config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-sandbox-codex-imagegen-'));
    roots.push(root);
    const hostHomeDir = join(root, 'host');
    const homeDir = join(root, 'agent-home');
    const codexHome = join(homeDir, '.codex');
    await mkdir(join(hostHomeDir, '.codex'), { recursive: true });
    await mkdir(codexHome, { recursive: true });
    await writeFile(join(hostHomeDir, '.codex', 'auth.json'), '{"token":"codex"}');
    await writeFile(
        join(codexHome, 'config.toml'),
        [
            'model = "gpt-5.6"',
            '',
            '',
            '',
            '# haus-managed: image generation routes through the image tool',
            '[features]',
            'image_generation = false',
            '',
            '[[skills.config]]',
            `path = ${JSON.stringify(join(codexHome, 'skills', '.system', 'imagegen', 'SKILL.md'))}`,
            'enabled = false',
            '',
            '[notice]',
            'hide_rate_limit_model_nudge = true',
            '',
        ].join('\n')
    );

    const provider = createLocalTrustedSandboxProvider({
        authProfiles: ['codex'],
        homeDir,
        hostHomeDir,
        rootDir: join(root, 'workspace'),
        runtime,
    });
    const firstSession = await provider.createSession?.();
    await firstSession?.destroy?.();
    const restored = await readFile(join(codexHome, 'config.toml'), 'utf8');

    expect(restored).toBe(
        [
            'model = "gpt-5.6"',
            '',
            '',
            '',
            '[notice]',
            'hide_rate_limit_model_nudge = true',
            '',
        ].join('\n')
    );

    const secondSession = await provider.createSession?.();
    await secondSession?.destroy?.();
    expect(await readFile(join(codexHome, 'config.toml'), 'utf8')).toBe(restored);
});

test('preserves an explicit Codex image-generation preference not owned by Haus', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-sandbox-codex-config-'));
    roots.push(root);
    const hostHomeDir = join(root, 'host');
    const homeDir = join(root, 'agent-home');
    const codexHome = join(homeDir, '.codex');
    await mkdir(join(hostHomeDir, '.codex'), { recursive: true });
    await mkdir(codexHome, { recursive: true });
    await writeFile(join(hostHomeDir, '.codex', 'auth.json'), '{"token":"codex"}');
    const explicitConfig = '[features]\nimage_generation = false\n';
    await writeFile(join(codexHome, 'config.toml'), explicitConfig);

    const session = await createLocalTrustedSandboxProvider({
        authProfiles: ['codex'],
        homeDir,
        hostHomeDir,
        rootDir: join(root, 'workspace'),
        runtime,
    }).createSession?.();
    await session?.destroy?.();

    expect(await readFile(join(codexHome, 'config.toml'), 'utf8')).toBe(explicitConfig);
});

test('sandbox file operations reject another Agent root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-sandbox-boundary-'));
    roots.push(root);
    const workspace = join(root, 'agent-a');
    await mkdir(workspace);
    await writeFile(join(root, 'agent-b-token'), 'secret');
    const session = await createLocalTrustedSandboxProvider({
        rootDir: workspace,
        runtime,
    }).createSession?.();
    if (!session) {
        throw new Error('Sandbox provider did not create a session.');
    }

    await expect(session.readTextFile?.({ path: '../agent-b-token' })).rejects.toThrow(
        'inside this Agent root'
    );
    await expect(session.readTextFile?.({ path: join(root, 'agent-b-token') })).rejects.toThrow(
        'inside this Agent root'
    );
    await session.destroy?.();
});

test('sandbox permits only the shared derived harness bootstrap outside the Agent root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-sandbox-bootstrap-'));
    roots.push(root);
    const session = await createLocalTrustedSandboxProvider({
        rootDir: join(root, 'agent'),
        runtime,
    }).createSession?.();
    if (!session) {
        throw new Error('Sandbox provider did not create a session.');
    }
    const bootstrapDir = join('/tmp/harness', `sandbox-test-${root.split('/').at(-1)}`);
    roots.push(bootstrapDir);

    await expect(
        session.writeTextFile?.({
            content: 'bridge',
            path: join(bootstrapDir, 'bridge.mjs'),
        })
    ).resolves.toBeUndefined();
    await session.writeTextFile?.({
        content: '{"private":true}',
        path: join(bootstrapDir, 'package.json'),
    });
    const canonicalBootstrapDir = await realpath(bootstrapDir);
    await expect(
        session.run?.({
            command: 'test -f package.json && pwd',
            workingDirectory: bootstrapDir,
        })
    ).resolves.toMatchObject({
        exitCode: 0,
        stdout: `${canonicalBootstrapDir}\n`,
    });
    await session.destroy?.();
});

async function exists(path: string): Promise<boolean> {
    return lstat(path).then(
        () => true,
        () => false
    );
}

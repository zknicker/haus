import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

interface ResourceLoader {
    getAgentsFiles(): { agentsFiles: { path: string; content: string }[] };
    reload(): Promise<void>;
}
interface ResourceLoaderClass {
    prototype: ResourceLoader;
    new (options: Record<string, unknown>): ResourceLoader;
}

const CANARY = 'CANARY_ANCESTOR_CONTEXT';
const roots: string[] = [];
const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

// Pi's resource loader reads AGENTS.md and CLAUDE.md from its cwd and every ancestor to `/`,
// which reached the operator's home. Haus patches the adapter to pass `noContextFiles`.
test('a Pi session loads no context files from the workspace or its ancestors', async () => {
    const { agentRoot, homeDir, workspace } = await canaryTree();
    const loaders = await recordResourceLoaders(async () => {
        const sandboxSession = await createLocalTrustedSandboxProvider({
            homeDir,
            hostHomeDir: join(agentRoot, 'host'),
            rootDir: agentRoot,
            runtime,
        }).createSession?.();
        if (!sandboxSession) {
            throw new Error('Sandbox provider did not create a session.');
        }
        const harness = createHarnessForRuntime('pi', 'medium');
        const session = await harness.doStart({
            sandboxSession,
            sessionId: 'agt_pi-context-isolation',
            sessionWorkDir: workspace,
        } as unknown as Parameters<typeof harness.doStart>[0]);
        await session.doDestroy?.();
        await sandboxSession.destroy?.();
    });

    expect(loaders.length).toBeGreaterThan(0);
    for (const loader of loaders) {
        expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
    }
}, 30_000);

test('the canary tree leaks into an unpatched Pi resource loader', async () => {
    const { parent, workspace } = await canaryTree();
    const Loader = await piResourceLoaderClass();
    const loader = new Loader({ agentDir: join(workspace, '.pi-agent'), cwd: workspace });
    await loader.reload();

    expect(loader.getAgentsFiles().agentsFiles.map((file) => file.path)).toEqual(
        expect.arrayContaining([join(parent, 'AGENTS.md'), join(workspace, 'AGENTS.md')])
    );
});

async function canaryTree() {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-pi-context-')));
    roots.push(root);
    const agentRoot = join(root, 'parent', 'servers', 'srv', 'agents', 'agt');
    const homeDir = join(agentRoot, 'home');
    const workspace = join(agentRoot, 'workspace');
    await mkdir(workspace, { recursive: true });
    await mkdir(homeDir, { recursive: true });
    await mkdir(join(root, 'parent', '.claude'), { recursive: true });
    for (const path of [
        join(root, 'parent', 'AGENTS.md'),
        join(root, 'parent', 'CLAUDE.md'),
        join(root, 'parent', '.claude', 'CLAUDE.md'),
        join(workspace, 'AGENTS.md'),
        join(workspace, 'CLAUDE.md'),
    ]) {
        await writeFile(path, `${CANARY}\n`);
    }
    return { agentRoot, homeDir, parent: join(root, 'parent'), workspace };
}

/** Runs `body` while recording every resource loader the Pi adapter reloads. */
async function recordResourceLoaders(body: () => Promise<void>): Promise<ResourceLoader[]> {
    const Loader = await piResourceLoaderClass();
    const reload = Loader.prototype.reload;
    const loaders: ResourceLoader[] = [];
    Loader.prototype.reload = function recordedReload(this: ResourceLoader) {
        loaders.push(this);
        return reload.call(this);
    };
    try {
        await body();
    } finally {
        Loader.prototype.reload = reload;
    }
    return loaders;
}

/** The exact pi-coding-agent module instance the Pi adapter imports. */
async function piResourceLoaderClass(): Promise<ResourceLoaderClass> {
    const adapterDir = dirname(Bun.resolveSync('@ai-sdk/harness-pi', import.meta.dir));
    const module = await import(Bun.resolveSync('@earendil-works/pi-coding-agent', adapterDir));
    return module.DefaultResourceLoader as ResourceLoaderClass;
}

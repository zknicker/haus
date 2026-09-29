import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {
    HarnessV1NetworkPolicy,
    HarnessV1NetworkSandboxSession,
    HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import type { EffectRuntime } from '@haus/effect';
import { createSandboxProcessRegistry } from './sandbox-processes.ts';

/**
 * The Computer's harness sandbox: a faithful port of Runtime's
 * `local-trusted-sandbox.ts`. Commands run as real host child processes so the
 * managed `haus` wrapper on PATH — the Agent's only output channel — reaches
 * the loopback proxy. Each launch gets an isolated logical HOME referencing the
 * host's native provider login (Codex OAuth, Claude, Grok Build, Pi).
 * Provider credentials remain host-owned (ADR 0019).
 */
export type LocalTrustedSandboxAuthProfile = 'claude-code' | 'codex' | 'grok-build' | 'pi';

interface LocalTrustedSandboxOptions {
    authProfiles?: readonly LocalTrustedSandboxAuthProfile[];
    env?: Record<string, string>;
    /** Where seeded auth profiles land; defaults to `<rootDir>/.home`. */
    homeDir?: string;
    /** Physical Grok home used only as the source of the host-owned login. */
    hostGrokHomeDir?: string;
    hostHomeDir?: string;
    rootDir: string;
    runtime: EffectRuntime<never>;
}

export function createLocalTrustedSandboxProvider(
    options: LocalTrustedSandboxOptions
): HarnessV1SandboxProvider {
    const rootDir = path.resolve(options.rootDir);
    const homeDir = path.resolve(options.homeDir ?? path.join(rootDir, '.home'));
    const hostHomeDir = path.resolve(
        options.hostHomeDir ??
            process.env.HAUS_COMPUTER_HOST_HOME ??
            process.env.HOME ??
            os.homedir()
    );
    const hostGrokHomeDir = path.resolve(
        options.hostGrokHomeDir ?? process.env.GROK_HOME ?? path.join(hostHomeDir, '.grok')
    );

    return {
        createSession: async (input = {}) => {
            const session = await createLocalTrustedSandboxSession({
                authProfiles: options.authProfiles ?? [],
                env: options.env ?? {},
                homeDir,
                hostGrokHomeDir,
                hostHomeDir,
                rootDir,
                runtime: options.runtime,
                sessionId: input.sessionId,
            });
            if (input.onFirstCreate) {
                await input.onFirstCreate(session.restricted(), {
                    abortSignal: input.abortSignal,
                });
            }
            return session;
        },
        providerId: 'haus-computer-local-trusted',
        resumeSession: async (input) =>
            createLocalTrustedSandboxSession({
                authProfiles: options.authProfiles ?? [],
                env: options.env ?? {},
                homeDir,
                hostGrokHomeDir,
                hostHomeDir,
                rootDir,
                runtime: options.runtime,
                sessionId: input.sessionId,
            }),
        specificationVersion: 'harness-sandbox-v1',
    };
}

async function createLocalTrustedSandboxSession(input: {
    authProfiles: readonly LocalTrustedSandboxAuthProfile[];
    env: Record<string, string>;
    homeDir: string;
    hostGrokHomeDir: string;
    hostHomeDir: string;
    rootDir: string;
    runtime: EffectRuntime<never>;
    sessionId?: string;
}): Promise<HarnessV1NetworkSandboxSession> {
    const rootDir = path.resolve(input.rootDir);
    await fs.mkdir(rootDir, { recursive: true });
    await referenceAuthProfiles({
        authProfiles: input.authProfiles,
        homeDir: input.homeDir,
        hostGrokHomeDir: input.hostGrokHomeDir,
        hostHomeDir: input.hostHomeDir,
    });
    const id = input.sessionId ?? `local_${randomUUID()}`;
    const processes = createSandboxProcessRegistry({
        defaultWorkingDirectory: rootDir,
        env: { ...input.env, HOME: input.homeDir },
        resolveWorkingDirectory: (value) => resolveLocalPath(rootDir, value),
        runtime: input.runtime,
    });
    let ports = [await reservePort()];

    const session: HarnessV1NetworkSandboxSession = {
        defaultWorkingDirectory: rootDir,
        description: `Local trusted workspace at ${rootDir}. Commands run on this host without isolation.`,
        destroy: processes.destroy,
        get id() {
            return id;
        },
        get ports() {
            return ports;
        },
        getPortEndpoint: async (options) => {
            const protocol = options.protocol ?? 'http';
            return { url: `${protocol}://127.0.0.1:${options.port}` };
        },
        getPortUrl: async (options) => (await session.getPortEndpoint(options)).url,
        readBinaryFile: async (options) => readBinaryFile(rootDir, options.path),
        readFile: async (options) => {
            const content = await readBinaryFile(rootDir, options.path);
            return content ? bytesToStream(content) : null;
        },
        readTextFile: async (options) => {
            const content = await readTextFile(rootDir, options.path, options.encoding);
            return sliceLines(content, options.startLine, options.endLine);
        },
        restricted: () => restrictedSession(session),
        run: async (options) => {
            const proc = await processes.spawn(options);
            const [stdout, stderr, status] = await Promise.all([
                streamToText(proc.stdout),
                streamToText(proc.stderr),
                proc.wait(),
            ]);
            return { exitCode: status.exitCode, stderr, stdout };
        },
        setNetworkPolicy: async (_policy: HarnessV1NetworkPolicy) => {},
        setPorts: async (nextPorts) => {
            ports = [...nextPorts];
        },
        spawn: processes.spawn,
        stop: processes.stop,
        writeBinaryFile: async (options) => writeBinaryFile(rootDir, options.path, options.content),
        writeFile: async (options) =>
            writeBinaryFile(rootDir, options.path, await streamToBytes(options.content)),
        writeTextFile: async (options) =>
            writeTextFile(rootDir, options.path, options.content, options.encoding),
    };

    return session;
}

function restrictedSession(session: HarnessV1NetworkSandboxSession): Experimental_SandboxSession {
    return {
        description: session.description,
        readBinaryFile: session.readBinaryFile,
        readFile: session.readFile,
        readTextFile: session.readTextFile,
        run: session.run,
        spawn: session.spawn,
        writeBinaryFile: session.writeBinaryFile,
        writeFile: session.writeFile,
        writeTextFile: session.writeTextFile,
    };
}

function resolveLocalPath(rootDir: string, value: string) {
    const target = path.resolve(rootDir, value);
    const harnessBootstrapRoot = path.resolve('/tmp/harness');
    const insideAgentRoot = target === rootDir || target.startsWith(`${rootDir}${path.sep}`);
    const insideHarnessBootstrap =
        target === harnessBootstrapRoot || target.startsWith(`${harnessBootstrapRoot}${path.sep}`);
    if (!(insideAgentRoot || insideHarnessBootstrap)) {
        throw new Error(
            `Sandbox path ${JSON.stringify(value)} must stay inside this Agent root ${JSON.stringify(rootDir)}.`
        );
    }
    return target;
}

/**
 * References the physical machine's native provider session from the isolated
 * HOME. Missing host state is skipped: a machine that never logged in that
 * runtime simply cannot run it.
 */
async function referenceAuthProfiles(input: {
    authProfiles: readonly LocalTrustedSandboxAuthProfile[];
    homeDir: string;
    hostGrokHomeDir: string;
    hostHomeDir: string;
}) {
    if (input.authProfiles.includes('codex')) {
        const codexHome = path.join(input.homeDir, '.codex');
        await linkIfExists({
            source: path.join(input.hostHomeDir, '.codex', 'auth.json'),
            target: path.join(codexHome, 'auth.json'),
        });
        await restoreCodexNativeImageGeneration(codexHome);
    }
    if (input.authProfiles.includes('claude-code')) {
        await linkIfExists({
            source: path.join(input.hostHomeDir, '.claude.json'),
            target: path.join(input.homeDir, '.claude.json'),
        });
        await linkIfExists({
            source: path.join(input.hostHomeDir, '.claude', '.credentials.json'),
            target: path.join(input.homeDir, '.claude', '.credentials.json'),
        });
    }
    if (input.authProfiles.includes('pi')) {
        await linkIfExists({
            source: path.join(input.hostHomeDir, '.pi', 'auth.json'),
            target: path.join(input.homeDir, '.pi', 'auth.json'),
        });
    }
    if (input.authProfiles.includes('grok-build')) {
        await linkIfExists({
            source: path.join(input.hostGrokHomeDir, 'auth.json'),
            target: path.join(input.homeDir, '.grok', 'auth.json'),
        });
    }
}

const legacyCodexImageGenerationMarker =
    '# haus-managed: image generation routes through the image tool';
const legacyCodexImageGenerationBlock = new RegExp(
    `${escapeRegExp(legacyCodexImageGenerationMarker)}\\n` +
        '\\[features\\]\\n' +
        'image_generation = false\\n\\n' +
        '\\[\\[skills\\.config\\]\\]\\n' +
        'path = [^\\n]+\\n' +
        'enabled = false(?:\\n{1,2}|$)',
    'u'
);

/**
 * Earlier releases disabled Codex's native image generation in every managed
 * Agent home. Remove only that release-owned block; explicit operator or Agent
 * config remains untouched, and Codex's stable native default takes effect.
 */
async function restoreCodexNativeImageGeneration(codexHome: string) {
    const configPath = path.join(codexHome, 'config.toml');
    const existing = await readConfig(configPath);
    if (!existing?.includes(legacyCodexImageGenerationMarker)) {
        return;
    }
    const restored = existing.replace(legacyCodexImageGenerationBlock, '');
    await fs.writeFile(configPath, restored.trimEnd() ? `${restored.trimEnd()}\n` : '', 'utf8');
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function readConfig(configPath: string) {
    try {
        return await fs.readFile(configPath, 'utf8');
    } catch (error) {
        if (isNodeCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}

async function linkIfExists(input: { source: string; target: string }) {
    try {
        await fs.stat(input.source);
        await fs.mkdir(path.dirname(input.target), { recursive: true });
        try {
            const target = await fs.lstat(input.target);
            if (target.isSymbolicLink() && (await fs.readlink(input.target)) === input.source) {
                return;
            }
            await fs.rm(input.target, { force: true, recursive: true });
        } catch (error) {
            if (!isNodeCode(error, 'ENOENT')) {
                throw error;
            }
        }
        await fs.symlink(input.source, input.target);
    } catch (error) {
        if (isNodeCode(error, 'ENOENT')) {
            return;
        }
        throw error;
    }
}

async function readBinaryFile(rootDir: string, filePath: string) {
    try {
        return new Uint8Array(await fs.readFile(resolveLocalPath(rootDir, filePath)));
    } catch (error) {
        if (isNodeCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}

async function readTextFile(rootDir: string, filePath: string, encoding = 'utf-8') {
    try {
        return await fs.readFile(resolveLocalPath(rootDir, filePath), encoding as BufferEncoding);
    } catch (error) {
        if (isNodeCode(error, 'ENOENT')) {
            return null;
        }
        throw error;
    }
}

async function writeBinaryFile(rootDir: string, filePath: string, content: Uint8Array) {
    const target = resolveLocalPath(rootDir, filePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
}

async function writeTextFile(
    rootDir: string,
    filePath: string,
    content: string,
    encoding = 'utf-8'
) {
    const target = resolveLocalPath(rootDir, filePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, encoding as BufferEncoding);
}

function sliceLines(content: null | string, startLine?: number, endLine?: number) {
    if (content === null) {
        return null;
    }
    if (!(startLine || endLine)) {
        return content;
    }
    const lines = content.split('\n');
    const start = Math.max((startLine ?? 1) - 1, 0);
    const end = Math.min(endLine ?? lines.length, lines.length);
    return lines.slice(start, end).join('\n');
}

function bytesToStream(bytes: Uint8Array) {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}

async function streamToBytes(stream: ReadableStream<Uint8Array>) {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
        const result = await reader.read();
        if (result.done) {
            break;
        }
        chunks.push(result.value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function streamToText(stream: ReadableStream<Uint8Array>) {
    return new TextDecoder().decode(await streamToBytes(stream));
}

function reservePort() {
    return new Promise<number>((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => {
                if (address && typeof address === 'object') {
                    resolve(address.port);
                    return;
                }
                reject(new Error('Failed to reserve a local sandbox port.'));
            });
        });
    });
}

function isNodeCode(error: unknown, code: string) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

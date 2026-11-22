import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import embeddedBinary from 'agent-desktop/bin/agent-desktop-darwin-arm64' with { type: 'file' };
import embeddedHelper from 'agent-desktop/bin/agent-desktop-macos-helper-darwin-arm64' with { type: 'file' };

export const agentDesktopVersion = '1.3.1';

const pinned = [
    {
        embedded: embeddedBinary,
        name: 'agent-desktop',
        sha256: '9a6b0829736a486da532a9d1ceed1e07192fa8967326c7b27125646adab6baf7',
    },
    {
        embedded: embeddedHelper,
        name: 'agent-desktop-macos-helper',
        sha256: '87348178e546974ee0f96b74dd03410f61f4972cae5eb5fbd36bf04d2cb50a42',
    },
] as const;

const installs = new Map<string, Promise<AgentDesktopInstall>>();

export interface AgentDesktopInstall {
    executable: string;
    helper: string;
}

export function agentDesktopToolsRoot(dataRoot: string) {
    return join(dataRoot, 'tools', 'agent-desktop', agentDesktopVersion);
}

export function computerUseLockPath(toolsRoot: string) {
    return resolve(toolsRoot, '..', '..', '..', 'computer-use.lock');
}

export function installAgentDesktop(toolsRoot: string) {
    const existing = installs.get(toolsRoot);
    if (existing) {
        return existing;
    }
    const install = writeInstall(toolsRoot);
    installs.set(toolsRoot, install);
    install.catch(() => installs.delete(toolsRoot));
    return install;
}

export async function validateEmbeddedAgentDesktop() {
    for (const file of pinned) {
        if (sha256(await readFile(file.embedded)) !== file.sha256) {
            throw new Error(
                `The embedded ${file.name} does not match its ${agentDesktopVersion} pin.`
            );
        }
    }
}

async function writeInstall(toolsRoot: string) {
    await mkdir(toolsRoot, { recursive: true });
    for (const file of pinned) {
        await writeVerified(toolsRoot, file);
    }
    return {
        executable: join(toolsRoot, 'agent-desktop'),
        helper: join(toolsRoot, 'agent-desktop-macos-helper'),
    } satisfies AgentDesktopInstall;
}

async function writeVerified(toolsRoot: string, file: (typeof pinned)[number]) {
    const target = join(toolsRoot, file.name);
    const current = await readFile(target).catch(() => null);
    if (current && sha256(current) === file.sha256) {
        return;
    }
    const bytes = await readFile(file.embedded);
    if (sha256(bytes) !== file.sha256) {
        throw new Error(`The embedded ${file.name} does not match its ${agentDesktopVersion} pin.`);
    }
    const staging = `${target}.${process.pid}.tmp`;
    await writeFile(staging, bytes, { mode: 0o755 });
    await chmod(staging, 0o755);
    await rename(staging, target);
}

function sha256(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}

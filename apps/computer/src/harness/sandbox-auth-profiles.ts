import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Pi has no profile: it runs in the Computer process and reads its login from the Computer's own
 * `~/.pi/agent/auth.json`, never from the Agent HOME.
 */
export type LocalTrustedSandboxAuthProfile = 'claude-code' | 'codex' | 'grok-build';

/**
 * References the physical machine's native provider session from the isolated
 * HOME. Missing host state is skipped: a machine that never logged in that
 * runtime simply cannot run it.
 */
export async function referenceAuthProfiles(input: {
    authProfiles: readonly LocalTrustedSandboxAuthProfile[];
    homeDir: string;
    hostGrokHomeDir: string;
    hostHomeDir: string;
}) {
    await unlinkHostClaudeState(input.homeDir);
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
            source: path.join(input.hostHomeDir, '.claude', '.credentials.json'),
            target: path.join(input.homeDir, '.claude', '.credentials.json'),
        });
    }
    if (input.authProfiles.includes('grok-build')) {
        await linkIfExists({
            source: path.join(input.hostGrokHomeDir, 'auth.json'),
            target: path.join(input.homeDir, '.grok', 'auth.json'),
        });
    }
}

/**
 * Earlier releases linked the operator's `~/.claude.json` into every Agent home. That file
 * carries the operator's user-scope MCP servers and per-project state, and Claude Code wrote
 * Agent state (including `claude mcp add`) straight through to it. Login resolves from host
 * credentials, so the Agent home keeps its own state file: any link there is dropped, never
 * followed, whatever the runtime.
 */
async function unlinkHostClaudeState(homeDir: string) {
    const statePath = path.join(homeDir, '.claude.json');
    try {
        if ((await fs.lstat(statePath)).isSymbolicLink()) {
            await fs.unlink(statePath);
        }
    } catch (error) {
        if (!isNodeCode(error, 'ENOENT')) {
            throw error;
        }
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
 * MCP servers declared here never load: Haus's codex-acp patch disables them.
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

function isNodeCode(error: unknown, code: string) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

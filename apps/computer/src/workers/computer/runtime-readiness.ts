import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { WorkerRuntimeReadiness } from '@haus/api';
import { runtimeSearchPath } from '../../runtime-discovery.ts';
import { claudeInstallTarget } from '../../runtime/claude-code/claude-install.ts';
import {
    CODEX_CLI_VERSION,
    codexInstallRoot,
    codexPinFingerprint,
} from '../../runtime/codex/codex-executable.ts';

const execFileAsync = promisify(execFile);

export interface ReadinessSources {
    env?: Readonly<Record<string, string | undefined>>;
    homeDir?: string;
    keychainHasClaudeLogin?: () => Promise<boolean>;
    platform?: NodeJS.Platform;
    searchPath?: string;
}

export async function detectWorkerRuntimes(sources: ReadinessSources = {}) {
    const env = sources.env ?? process.env;
    const homeDir = sources.homeDir ?? env.HAUS_COMPUTER_HOST_HOME ?? env.HOME ?? homedir();
    const searchPath = sources.searchPath ?? runtimeSearchPath({ homeDirectory: homeDir });
    const onPath = (command: string) => Bun.which(command, { PATH: searchPath }) !== null;
    const claudeInstalled = existsSync(claudeInstallTarget(homeDir).binaryPath) || onPath('claude');
    const codexInstalled = existsSync(pinnedCodexLink(homeDir)) || onPath('codex');
    return [
        readiness('claude-code', claudeInstalled, await claudeLoggedIn(env, homeDir, sources), {
            login: 'Claude Code has no login on this Computer. Run claude and sign in.',
            missing: 'Claude Code is not installed on this Computer.',
        }),
        readiness('codex', codexInstalled, codexLoggedIn(env, homeDir), {
            login: 'Codex has no login on this Computer. Run codex login.',
            missing: 'Codex is not installed on this Computer.',
        }),
    ] satisfies WorkerRuntimeReadiness[];
}

function readiness(
    runtime: WorkerRuntimeReadiness['runtime'],
    installed: boolean,
    loggedIn: boolean,
    details: { login: string; missing: string }
) {
    if (!installed) {
        return { detail: details.missing, ready: false, runtime };
    }
    return loggedIn
        ? { detail: null, ready: true, runtime }
        : { detail: details.login, ready: false, runtime };
}

async function claudeLoggedIn(
    env: Readonly<Record<string, string | undefined>>,
    homeDir: string,
    sources: ReadinessSources
) {
    if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.CLAUDE_CODE_OAUTH_TOKEN) {
        return true;
    }
    const defaultDir = resolve(join(homeDir, '.claude'));
    const configDir = resolve(env.CLAUDE_CONFIG_DIR ?? defaultDir);
    if (existsSync(join(configDir, '.credentials.json'))) {
        return true;
    }
    if ((sources.platform ?? process.platform) !== 'darwin' || configDir !== defaultDir) {
        return false;
    }
    return await (sources.keychainHasClaudeLogin ?? (() => keychainHasEntry(env.USER ?? '')))();
}

function codexLoggedIn(env: Readonly<Record<string, string | undefined>>, homeDir: string) {
    return existsSync(join(env.CODEX_HOME ?? join(homeDir, '.codex'), 'auth.json'));
}

function pinnedCodexLink(homeDir: string) {
    return join(
        codexInstallRoot(homeDir),
        `${CODEX_CLI_VERSION}-${codexPinFingerprint.slice(0, 12)}`,
        'node_modules',
        '@openai',
        'codex'
    );
}

async function keychainHasEntry(account: string) {
    try {
        await execFileAsync('/usr/bin/security', [
            'find-generic-password',
            '-s',
            'Claude Code-credentials',
            '-a',
            account,
        ]);
        return true;
    } catch {
        return false;
    }
}

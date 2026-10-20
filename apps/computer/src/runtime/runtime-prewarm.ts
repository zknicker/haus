import { claudeInstallTarget, ensureClaudeInstall } from './claude-code/claude-install.ts';
import { resolvePinnedCodex } from './codex/codex-executable.ts';

/** A runtime whose driver installs a pinned CLI before its first session. */
export type PrewarmedRuntime = 'claude-code' | 'codex';

const installs: Record<PrewarmedRuntime, () => Promise<unknown>> = {
    'claude-code': () => ensureClaudeInstall(claudeInstallTarget()),
    codex: () => resolvePinnedCodex(),
};

/**
 * Installs the drivers' pinned CLIs once per daemon, so an Agent's first turn does not pay for
 * the download. Best effort and never blocking: a failed warm only means the first turn installs,
 * which it does through the same shared install. Runtimes warm one at a time on purpose.
 */
export function createRuntimePrewarmer(options: {
    runtimes?: readonly PrewarmedRuntime[];
}): () => void {
    let started = false;
    return () => {
        if (started) {
            return;
        }
        started = true;
        void prewarmRuntimes({ ...options, log: (line) => console.error(line) });
    };
}

export async function prewarmRuntimes(options: {
    install?: (runtime: PrewarmedRuntime) => Promise<unknown>;
    log: (line: string) => void;
    runtimes?: readonly PrewarmedRuntime[];
}): Promise<void> {
    const install = options.install ?? ((runtime: PrewarmedRuntime) => installs[runtime]());
    for (const runtime of options.runtimes ?? (['claude-code', 'codex'] as const)) {
        const startedAt = Date.now();
        try {
            await install(runtime);
            const seconds = Math.round((Date.now() - startedAt) / 1000);
            options.log(`[runtime-prewarm] ${runtime} install ready (${seconds}s)`);
        } catch (error) {
            options.log(
                `[runtime-prewarm] ${runtime} install skipped; the first turn installs it: ${String(error).slice(0, 200)}`
            );
        }
    }
}

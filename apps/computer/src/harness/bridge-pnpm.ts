/** Every bridge installs with one pinned pnpm, whatever the host has on PATH. */
export const bridgePnpm = 'CI=true corepack pnpm@10.32.1';

export function installCommand(storeDir?: string) {
    return `${bridgePnpm} install --frozen-lockfile --store-dir ${storeDir ? `"${storeDir}"` : '.pnpm-store'}`;
}

/**
 * pnpm exits 0 even when an OPTIONAL dependency (the runtime's platform
 * binary) fails to download — observed live under concurrent first-time
 * bootstraps, leaving a bridge that fails every turn. Each post-install
 * command therefore doubles as the verification gate: on failure it retries
 * once from a clean slate, and if that also fails the bootstrap fails loudly.
 * A failed bootstrap writes no completion marker, so the next session start
 * re-runs it rather than keeping a broken bridge forever. A SHARED store is
 * never wiped on retry — other Agents hard-link from it concurrently.
 */
export function verifiedCommand(command: string, storeDir?: string) {
    return retriedOnce({
        install: installCommand(storeDir),
        verify: command,
        wipe: storeDir ? 'node_modules' : 'node_modules .pnpm-store',
    });
}

export function retriedOnce(input: { install: string; verify: string; wipe: string }) {
    return `(${input.verify}) || (rm -rf ${input.wipe} && ${input.install} && (${input.verify}))`;
}

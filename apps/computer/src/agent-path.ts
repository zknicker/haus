import { dirname } from 'node:path';
import { type ResolvedRuntimeExecutable, runtimeSearchPath } from './runtime-discovery.ts';
import { secretsPaths } from './secrets/store.ts';

/**
 * The PATH every Agent turn runs with: its own `haus` wrapper first, then
 * `haus-secrets` (present only when the Owner connected a 1Password vault),
 * then the execution runtime's directory and the stable service PATH.
 */
export function agentPath({
    binDir,
    options,
    runtimeExecutable,
}: {
    binDir: string;
    options: { attachment: { serverId: string }; dataRoot: string };
    runtimeExecutable: ResolvedRuntimeExecutable | null | undefined;
}): string {
    return [
        binDir,
        secretsPaths(options.dataRoot, options.attachment.serverId).binDir,
        runtimeExecutable?.path ? dirname(runtimeExecutable.path) : null,
        runtimeExecutable?.searchPath ?? runtimeSearchPath(),
    ]
        .filter(Boolean)
        .join(':');
}

// The `haus` a `--preview` lab run puts on its turns' PATH.
//
// The lab has no Computer, so there is no managed wrapper and, by default, no
// `haus` at all. A revision whose lab.json asks for preview (columns.mjs) gets
// this shim instead, so its agent can run `haus visual preview` on a draft.
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const computerEntry = path.join(repoRoot, 'apps/computer/src/index.ts');

/** The turn's PATH: the runtime's directory and search path, behind the shim only with `preview`. */
export const labPath = async ({ binDir, executable, preview }) => {
    const base = [path.dirname(executable.path), executable.searchPath];
    if (!preview) {
        return base.join(':');
    }
    await writeHausShim(binDir);
    return [binDir, ...base].join(':');
};

/**
 * A `haus` that execs the Computer's Agent CLI from source, the way the
 * managed wrapper (apps/computer/src/wrapper.ts) execs the built one. It
 * carries no identity env: only `haus visual …` is local, and every
 * Server-backed subcommand fails for want of a runner token, which is fine.
 */
export const writeHausShim = async (binDir) => {
    await mkdir(binDir, { recursive: true });
    const file = path.join(binDir, 'haus');
    const command = [process.execPath, computerEntry, '__agent'].map(shellQuote).join(' ');
    await writeFile(file, `#!/bin/sh\nexec ${command} "$@"\n`, { mode: 0o755 });
    await chmod(file, 0o755);
    return file;
};

function shellQuote(value) {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}

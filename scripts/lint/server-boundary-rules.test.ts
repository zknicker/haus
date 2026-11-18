import { describe, expect, test } from 'bun:test';
import { unlinkSync, writeFileSync } from 'node:fs';

const biomeTimeoutMs = 30_000;
const updateRequired = 'Only the App protocol gate in haus-api/trpc.ts throws PRECONDITION_FAILED';
const envLoader = 'Server config never reads an env file of its own';

function lintFile(path: string) {
    const run = Bun.spawnSync(['bun', 'x', 'biome', 'lint', path], {
        stderr: 'pipe',
        stdout: 'pipe',
    });
    return `${run.stdout.toString()}${run.stderr.toString()}`;
}

/** Biome skips plugins for stdin input, so the probe is a real file it lints. */
function lintProbe(directory: string, source: string) {
    const probe = `${directory}/probe-${crypto.randomUUID()}.ts`;
    writeFileSync(probe, source);
    try {
        return lintFile(probe);
    } finally {
        unlinkSync(probe);
    }
}

describe('update-required-code lint rule', () => {
    test(
        'rejects PRECONDITION_FAILED anywhere else in Server source',
        () => {
            const source = [
                "throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'not configured' });",
                "const code = 'PRECONDITION_FAILED';",
            ].join('\n');
            expect(lintProbe('apps/server/src', source).split(updateRequired).length - 1).toBe(2);
        },
        biomeTimeoutMs
    );

    test(
        'allows the protocol gate and code outside Server source',
        () => {
            expect(lintFile('apps/server/src/haus-api/trpc.ts')).not.toContain(updateRequired);
            expect(
                lintProbe('apps/server/lint', "const code = 'PRECONDITION_FAILED';")
            ).not.toContain(updateRequired);
        },
        biomeTimeoutMs
    );
});

describe('config-env-loader lint rule', () => {
    test(
        'rejects file and dotenv imports in Server config',
        () => {
            const source = [
                "import { readFileSync } from 'node:fs';",
                "import 'dotenv/config';",
                "import { config } from 'dotenv';",
            ].join('\n');
            expect(lintProbe('apps/server/src/config', source).split(envLoader).length - 1).toBe(3);
        },
        biomeTimeoutMs
    );

    test(
        'allows other imports in config and file reads elsewhere',
        () => {
            expect(lintProbe('apps/server/src/config', "import { z } from 'zod';")).not.toContain(
                envLoader
            );
            expect(
                lintProbe('apps/server/src', "import { readFileSync } from 'node:fs';")
            ).not.toContain(envLoader);
        },
        biomeTimeoutMs
    );
});

import type { HarnessV1, HarnessV1Bootstrap } from '@ai-sdk/harness';
// Computer pins codex-acp and, through a pnpm override, the Codex CLI it drives.
// The ACP bridge itself is @ai-sdk/harness-acp's, carrying Haus's steering patch.
// codex-acp's own pnpm patch puts app-server's per-request token usage on the wire.
import codexAcpPatch from '../../assets/harness-bridges/codex/codex-acp.patch' with {
    type: 'text',
};
import codexAcpPackage from '../../assets/harness-bridges/codex/package.json' with { type: 'text' };
import codexAcpLockfile from '../../assets/harness-bridges/codex/pnpm-lock.yaml' with {
    type: 'text',
};
import { bridgePnpm, retriedOnce } from './bridge-pnpm.ts';

export const codexAcpImplementationFiles: ReadonlyArray<{ content: string; name: string }> = [
    { content: codexAcpPackage as unknown as string, name: 'package.json' },
    { content: codexAcpLockfile, name: 'pnpm-lock.yaml' },
    { content: codexAcpPatch, name: 'codex-acp.patch' },
];

/**
 * `codex-acp --version` answers before touching Codex, so resolve the bundled
 * CLI exactly as codex-acp does and run it. This is the check that catches a
 * lost optional platform binary, which pnpm reports as a successful install.
 */
const verifyCodexCli = `node --input-type=module -e 'import { realpathSync } from "node:fs"; import { createRequire } from "node:module"; import { execFileSync } from "node:child_process"; const codex = createRequire(realpathSync("node_modules/@agentclientprotocol/codex-acp/package.json")).resolve("@openai/codex/bin/codex.js"); execFileSync(process.execPath, [codex, "--version"], { stdio: "ignore" });'`;

/**
 * Installs and verifies the pinned implementation from its own directory. With
 * no shared store it uses the bootstrap's store beside it, as harness-acp does.
 * The retry wipes only this install: a shared store is hard-linked by others.
 */
export function codexAcpImplementationCommand(storeDir?: string) {
    const install = `${bridgePnpm} install --ignore-workspace --frozen-lockfile --prod --store-dir ${storeDir ? `"${storeDir}"` : '../.pnpm-store'}`;
    return `${install} && ${retriedOnce({ install, verify: verifyCodexCli, wipe: 'node_modules' })}`;
}

/**
 * harness-acp installs into a per-bootstrap `.pnpm-store`, which would fetch
 * the Codex platform binary once per Agent. Computer keeps the adapter's files
 * and replaces only its install commands, pointing both installs at the
 * machine-wide store and gating the implementation on a working Codex CLI.
 */
export function withCodexAcpBootstrap<T extends HarnessV1>(
    harness: T,
    { storeDir }: { storeDir?: string } = {}
): T {
    let cachedBootstrap: HarnessV1Bootstrap | undefined;
    return {
        ...harness,
        getBootstrap: async () => {
            cachedBootstrap ??= await readCodexAcpBootstrap(harness, storeDir);
            return cachedBootstrap;
        },
    };
}

async function readCodexAcpBootstrap(
    harness: HarnessV1,
    storeDir: string | undefined
): Promise<HarnessV1Bootstrap> {
    const bootstrap = await harness.getBootstrap?.();
    if (!bootstrap) {
        throw new Error('The Codex ACP harness did not provide a bootstrap.');
    }
    return {
        ...bootstrap,
        commands: [
            {
                command: `${bridgePnpm} install --ignore-workspace --frozen-lockfile --store-dir ${storeDir ? `"${storeDir}"` : '.pnpm-store'}`,
            },
            { command: `(cd implementation && ${codexAcpImplementationCommand(storeDir)})` },
        ],
        files: [
            ...bootstrap.files,
            // harness-acp writes only the manifest and lockfile; the lockfile pins this patch.
            {
                content: codexAcpPatch,
                path: `${bootstrap.bootstrapDir}/implementation/codex-acp.patch`,
            },
            {
                content: 'haus-computer-v1\n',
                path: `${bootstrap.bootstrapDir}/haus-computer-owner`,
            },
        ],
    };
}

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HarnessV1, HarnessV1Bootstrap } from '@ai-sdk/harness';
import { createGrokBuild } from '@ai-sdk/harness-grok-build';
// The adapter ships a bridge manifest pinning its vendor CLI, and that pin
// trails the models Haus offers: at @ai-sdk/harness-claude-code 1.0.117 it pins
// @anthropic-ai/claude-code 2.1.245, which rejects `claude-fable-5-1` below
// 2.1.251. So Computer owns the manifest and lockfile and takes only the
// adapter's bridge code from the package. DELETE this override — and go back to
// importing both files from the package — once the published bridge pins a
// vendor at or above that floor. The bridge recipe is content-fingerprinted, so
// changing a pin here invalidates every stored bootstrap on its own.
import claudeCodePackage from '../../assets/harness-bridges/claude-code/package.json' with {
    type: 'text',
};
import claudeCodeLockfile from '../../assets/harness-bridges/claude-code/pnpm-lock.yaml' with {
    type: 'text',
};
// @ts-expect-error -- Bun's text loader embeds this bridge in the standalone executable.
import claudeCodeBridge from '../../node_modules/@ai-sdk/harness-claude-code/dist/bridge/index.mjs' with {
    type: 'text',
};
import { installCommand, verifiedCommand } from './bridge-pnpm.ts';
import { createCodexAcp } from './codex-acp.ts';
import {
    codexAcpImplementationCommand,
    codexAcpImplementationFiles,
} from './codex-acp-bootstrap.ts';

const require = createRequire(import.meta.url);

/** Runtimes whose install Computer warms into the machine-wide store. */
export type BridgeHarnessId = 'claude-code' | 'codex';
const bridgeHarnessIds: readonly BridgeHarnessId[] = ['claude-code', 'codex'];

const bridgeSpecs = {
    'claude-code': {
        bootstrapDir: '.harness-bootstrap/claude-code',
        files: [
            { assetName: 'package.json', bootstrapName: 'package.json' },
            { assetName: 'pnpm-lock.yaml', bootstrapName: 'pnpm-lock.yaml' },
            { assetName: 'index.mjs', bootstrapName: 'bridge.mjs' },
        ],
        packageName: '@ai-sdk/harness-claude-code',
        postInstallCommands: [
            'if [ -f node_modules/@anthropic-ai/claude-code/install.cjs ]; then node node_modules/@anthropic-ai/claude-code/install.cjs; fi && ./node_modules/.bin/claude --version',
        ],
    },
} as const;
type ComputerBridgeHarnessId = keyof typeof bridgeSpecs;

const embeddedBridgeAssets: Record<ComputerBridgeHarnessId, Readonly<Record<string, string>>> = {
    'claude-code': {
        'index.mjs': claudeCodeBridge,
        'package.json': claudeCodePackage as unknown as string,
        'pnpm-lock.yaml': claudeCodeLockfile,
    },
};

/**
 * The proven Runtime bridge bootstrap, now owned and shipped by Computer.
 * `storeDir` points every Agent's install at one shared, content-addressed
 * pnpm store (pnpm serializes concurrent store access itself) so the runtime's
 * platform binary is fetched once per physical machine instead of once per
 * Computer or Agent.
 */
export function withComputerBridgeBootstrap<T extends HarnessV1>(
    harness: T,
    harnessId: ComputerBridgeHarnessId,
    { storeDir }: { storeDir?: string } = {}
): T {
    const spec = bridgeSpecs[harnessId];
    let cachedBootstrap: HarnessV1Bootstrap | undefined;
    return {
        ...harness,
        getBootstrap: async () => {
            cachedBootstrap ??= await readBridgeBootstrap(harnessId, spec, storeDir);
            return cachedBootstrap;
        },
    };
}

/** Installed bridge packages are machine software, not Server-scoped Agent state. */
export function bridgeStoreDirForHost(homeDirectory = homedir()) {
    return join(homeDirectory, '.haus', 'cache', 'harness-bridge-store');
}

/**
 * Everything a boot-time pre-warm needs to populate the shared store before
 * any Agent exists: the pinned manifest + lockfile and the same verified
 * install the per-Agent bootstrap will later run (which then hard-links from
 * the warm store instead of fetching).
 */
export async function readBridgePrewarmPlans(
    harnessIds: readonly BridgeHarnessId[] = bridgeHarnessIds
): Promise<
    Array<{
        command: (storeDir: string) => string;
        files: Array<{ content: string; name: string }>;
        harnessId: BridgeHarnessId;
    }>
> {
    return await Promise.all(
        harnessIds.map(async (harnessId) => {
            if (harnessId === 'codex') {
                return {
                    command: codexAcpImplementationCommand,
                    files: [...codexAcpImplementationFiles],
                    harnessId,
                };
            }
            const spec = bridgeSpecs[harnessId];
            return {
                command: (storeDir: string) =>
                    [
                        installCommand(storeDir),
                        ...('postInstallCommands' in spec
                            ? spec.postInstallCommands.map((command) =>
                                  verifiedCommand(command, storeDir)
                              )
                            : []),
                    ].join(' && '),
                files: await Promise.all(
                    spec.files
                        .filter((file) => file.assetName !== 'index.mjs')
                        .map(async (file) => ({
                            content: await readBridgeAsset(
                                harnessId,
                                spec.packageName,
                                file.assetName
                            ),
                            name: file.bootstrapName,
                        }))
                ),
                harnessId,
            };
        })
    );
}

/** Release/doctor gate: embedded bridge files land where each adapter launches them. */
export async function validateComputerBridgeAssets(): Promise<void> {
    await readBridgeBootstrap('claude-code', bridgeSpecs['claude-code']);
    const grokBuildBootstrap = await createGrokBuild().getBootstrap?.();
    const grokBuildDescriptor = grokBuildBootstrap?.files?.find(
        (file) => file.path === '.harness-bootstrap/grok-build/implementation/implementation.json'
    );
    if (
        !grokBuildDescriptor?.content.includes('"local": true') ||
        grokBuildBootstrap?.files?.some((file) =>
            file.path.endsWith('/implementation/package.json')
        )
    ) {
        throw new Error('Grok Build must use the detected local executable.');
    }
    assertLiveUserMessageDelivery(grokBuildBootstrap, 'grok-build', '_x.ai/interject');
    const codexBootstrap = await createCodexAcp({ webSearch: false }).getBootstrap?.();
    if (
        !codexBootstrap?.files?.some(
            (file) =>
                file.path === '.harness-bootstrap/codex/implementation/package.json' &&
                file.content.includes('"@agentclientprotocol/codex-acp"')
        )
    ) {
        throw new Error('Codex must install the pinned codex-acp implementation.');
    }
    assertLiveUserMessageDelivery(codexBootstrap, 'codex', '_session/steering');
}

/** Both ACP runtimes steer only through Haus's harness-acp patch. */
function assertLiveUserMessageDelivery(
    bootstrap: HarnessV1Bootstrap | undefined,
    harnessId: 'codex' | 'grok-build',
    method: string
) {
    const bridge = bootstrap?.files?.find(
        (file) => file.path === `.harness-bootstrap/${harnessId}/bridge.mjs`
    );
    if (
        !(
            bridge?.content.includes(`bridgeType === "${harnessId}"`) &&
            bridge.content.includes(`connection.agent.request("${method}"`) &&
            bridge.content.includes('message.accept()')
        )
    ) {
        throw new Error(`${harnessId} bridge does not include live user-message delivery.`);
    }
}

async function readBridgeBootstrap(
    harnessId: ComputerBridgeHarnessId,
    spec: (typeof bridgeSpecs)[ComputerBridgeHarnessId],
    storeDir?: string
): Promise<HarnessV1Bootstrap> {
    return {
        bootstrapDir: spec.bootstrapDir,
        commands: [
            { command: installCommand(storeDir) },
            ...('postInstallCommands' in spec
                ? spec.postInstallCommands.map((command) => ({
                      command: verifiedCommand(command, storeDir),
                  }))
                : []),
        ],
        files: [
            ...(await Promise.all(
                spec.files.map(async (file) => ({
                    content: await readBridgeAsset(harnessId, spec.packageName, file.assetName),
                    path: `${spec.bootstrapDir}/${file.bootstrapName}`,
                }))
            )),
            {
                content: 'haus-computer-v1\n',
                path: `${spec.bootstrapDir}/haus-computer-owner`,
            },
        ],
        harnessId,
    };
}

async function readBridgeAsset(
    harnessId: ComputerBridgeHarnessId,
    packageName: string,
    name: string
) {
    const embedded = embeddedBridgeAssets[harnessId][name];
    if (embedded?.length) {
        return embedded;
    }
    const roots = bridgeAssetRoots(harnessId, packageName);
    for (const root of roots) {
        try {
            return await readFile(join(root, name), 'utf8');
        } catch {
            // Try the next packaged/source asset root.
        }
    }
    throw new Error(`Harness bridge asset "${harnessId}/${name}" was not found.`);
}

function bridgeAssetRoots(harnessId: ComputerBridgeHarnessId, packageName: string) {
    const roots = [
        join(
            dirname(fileURLToPath(import.meta.url)),
            '..',
            '..',
            'assets',
            'harness-bridges',
            harnessId
        ),
    ];
    try {
        roots.push(join(dirname(require.resolve(`${packageName}/package.json`)), 'dist', 'bridge'));
    } catch {
        // A compiled artifact can rely entirely on its bundled Computer assets.
    }
    return [...new Set(roots.map((root) => resolve(root)))];
}

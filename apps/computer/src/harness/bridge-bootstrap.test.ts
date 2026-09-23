import { expect, test } from 'bun:test';
import type { HarnessV1 } from '@ai-sdk/harness';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createGrokBuild } from '@ai-sdk/harness-grok-build';
import { fingerprintHarnessBootstrap } from './bootstrap-refresh.ts';
import {
    bridgeStoreDirForHost,
    validateComputerBridgeAssets,
    withComputerBridgeBootstrap,
} from './bridge-bootstrap.ts';

for (const bridge of [
    {
        bootstrapDir: '.harness-bootstrap/claude-code',
        harnessId: 'claude-code' as const,
        nativeHarness: createClaudeCode(),
        packageDependency: '"@anthropic-ai/claude-code": "2.1.257"',
        verifyFragment: './node_modules/.bin/claude --version',
    },
]) {
    test(`Computer ships the pinned ${bridge.harnessId} bridge bootstrap from its bootstrap directory`, async () => {
        const harness = withComputerBridgeBootstrap(bridge.nativeHarness, bridge.harnessId);
        const bootstrap = await harness.getBootstrap?.();
        const nativeBootstrap = await bridge.nativeHarness.getBootstrap?.();
        expect(bootstrap).toBeDefined();
        expect(nativeBootstrap).toBeDefined();
        if (!(bootstrap && nativeBootstrap)) {
            return;
        }
        const packageFile = bootstrap.files?.find((file) => file.path.endsWith('/package.json'));

        expect(bootstrap.bootstrapDir).toBe(bridge.bootstrapDir);
        expect(bootstrap.bootstrapDir).toBe(nativeBootstrap.bootstrapDir);
        expect(packageFile?.content).toContain(bridge.packageDependency);
        expect(bootstrap.files).toContainEqual({
            content: 'haus-computer-v1\n',
            path: `${bridge.bootstrapDir}/haus-computer-owner`,
        });
        expect(bootstrap.commands?.[0]).toEqual({
            command:
                'CI=true corepack pnpm@10.32.1 install --frozen-lockfile --store-dir .pnpm-store',
        });
        // The post-install verify gates the bootstrap: a lost optional
        // platform binary exits pnpm 0, so without this gate the completion
        // marker would seal a permanently broken bridge. The verify retries
        // once from a clean slate before failing the bootstrap loudly.
        const verify = bootstrap.commands?.at(-1)?.command ?? '';
        expect(bootstrap.commands).toHaveLength(2);
        expect(verify).toContain(bridge.verifyFragment);
        expect(verify).toContain(
            '|| (rm -rf node_modules .pnpm-store && CI=true corepack pnpm@10.32.1 install --frozen-lockfile --store-dir .pnpm-store && ('
        );
        expect(
            bootstrap.files?.find((file) => file.path.endsWith('/bridge.mjs'))?.content
        ).toBeTruthy();
    });
}

test('a shared store directory rides every install and is never wiped on retry', async () => {
    const harness = withComputerBridgeBootstrap(createClaudeCode(), 'claude-code', {
        storeDir: '/computer/agents/.harness-bridge-store',
    });
    const bootstrap = await harness.getBootstrap?.();
    const install = bootstrap?.commands?.[0]?.command ?? '';
    const verify = bootstrap?.commands?.at(-1)?.command ?? '';

    expect(install).toContain('--store-dir "/computer/agents/.harness-bridge-store"');
    expect(verify).toContain('--store-dir "/computer/agents/.harness-bridge-store"');
    // Other Agents hard-link from the shared store concurrently; the clean
    // retry may only wipe this bootstrap's own node_modules.
    expect(verify).toContain('rm -rf node_modules &&');
    expect(verify).not.toContain('.pnpm-store &&');
});

test('bridge packages share one cache across development and production Computers', () => {
    expect(bridgeStoreDirForHost('/Users/example')).toBe(
        '/Users/example/.haus/cache/harness-bridge-store'
    );
});

test('Computer embeds every packaged harness bridge asset', async () => {
    await expect(validateComputerBridgeAssets()).resolves.toBeUndefined();
});

// The published bridge pins a vendor CLI that predates the models Haus offers,
// so Computer owns the manifest. Delete this test with the override.
for (const bridge of [
    {
        harnessId: 'claude-code' as const,
        nativeHarness: createClaudeCode(),
        // `claude-fable-5-1` needs 2.1.251 or newer.
        pinned: '"@anthropic-ai/claude-code": "2.1.257"',
    },
]) {
    test(`Computer overrides the published ${bridge.harnessId} bridge vendor pin`, async () => {
        const computerBootstrap = await withComputerBridgeBootstrap(
            bridge.nativeHarness,
            bridge.harnessId
        ).getBootstrap?.();
        const publishedBootstrap = await bridge.nativeHarness.getBootstrap?.();
        const manifestOf = (bootstrap: typeof computerBootstrap) =>
            bootstrap?.files?.find((file) => file.path.endsWith('/package.json'))?.content;

        expect(manifestOf(computerBootstrap)).toContain(bridge.pinned);
        expect(manifestOf(publishedBootstrap)).not.toContain(bridge.pinned);
        // Only the manifest and its lockfile are Computer's; the bridge code
        // itself must still be exactly what the adapter published.
        expect(computerBootstrap?.files?.find((file) => file.path.endsWith('/bridge.mjs'))).toEqual(
            publishedBootstrap?.files?.find((file) => file.path.endsWith('/bridge.mjs'))
        );
    });
}

test('the pinned vendor version is part of the bootstrap fingerprint', async () => {
    const withPin = (pin: string) =>
        fingerprintHarnessBootstrap({
            harness: {
                getBootstrap: () =>
                    Promise.resolve({
                        bootstrapDir: '.harness-bootstrap/codex',
                        commands: [],
                        files: [{ content: pin, path: '.harness-bootstrap/codex/package.json' }],
                        harnessId: 'codex',
                    }),
            } as unknown as HarnessV1,
        });

    // A bumped pin must not reuse an install made from the previous one.
    expect(await withPin('0.153.4')).not.toBe(await withPin('0.149.1'));
    expect(await withPin('0.153.4')).toBe(await withPin('0.153.4'));
});

test('Claude Code bridge captures structured plan usage only when Computer leases a refresh', async () => {
    const bootstrap = await withComputerBridgeBootstrap(
        createClaudeCode(),
        'claude-code'
    ).getBootstrap?.();
    const bridge = bootstrap?.files?.find((file) => file.path.endsWith('/bridge.mjs'))?.content;

    expect(bridge).toContain('HAUS_CLAUDE_USAGE_REFRESH');
    expect(bridge).toContain('usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET');
    expect(bridge).toContain('planUsage');
});

test('Grok Build bridge pins the private live-interjection contract', async () => {
    const bootstrap = await createGrokBuild().getBootstrap?.();
    const bridge = bootstrap?.files?.find(
        (file) => file.path === '.harness-bootstrap/grok-build/bridge.mjs'
    )?.content;

    expect(bridge).toBeDefined();
    expect(bridge).toContain('connection.agent.request("_x.ai/interject"');
    expect(bridge).not.toContain('connection.agent.request("x.ai/interject"');
    expect(bridge).toContain('await interjectionReady');
    expect(bridge).toContain('message.kind === "session_update"');
    expect(bridge).toContain('markInterjectionReady?.()');
    expect(bridge).toContain('turn.experimental_userMessages');
    expect(bridge).toContain('message.accept()');
    expect(bridge).toContain('message.reject(error)');
});

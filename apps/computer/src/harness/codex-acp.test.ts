import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { codexAcpEnvironment, createCodexAcp } from './codex-acp.ts';
import { withCodexAcpBootstrap } from './codex-acp-bootstrap.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';

const storeDir = '/computer/.haus/cache/harness-bridge-store';

test('the runtime table drives Codex through codex-acp behind harness-acp', async () => {
    const harness = createHarnessForRuntime('codex', 'high', true, storeDir);
    const bootstrap = await harness.getBootstrap?.();
    const descriptor = bootstrap?.files.find((file) =>
        file.path.endsWith('/implementation/implementation.json')
    );

    expect(harness.harnessId).toBe('codex');
    expect(Object.keys(harness.builtinTools).sort()).toEqual(['bash', 'webSearch']);
    expect(bootstrap?.bootstrapDir).toBe('.harness-bootstrap/codex');
    expect(JSON.parse(descriptor?.content ?? '{}')).toMatchObject({
        args: [],
        envKeys: ['CODEX_CONFIG', 'INITIAL_AGENT_MODE', 'NO_BROWSER'],
        executablePath: 'node_modules/.bin/codex-acp',
        local: false,
    });
});

test('codex-acp is pinned together with the Codex CLI it drives', async () => {
    const bootstrap = await createHarnessForRuntime('codex', 'default').getBootstrap?.();
    const manifest = bootstrap?.files.find((file) =>
        file.path.endsWith('/implementation/package.json')
    )?.content;
    const lockfile = bootstrap?.files.find((file) =>
        file.path.endsWith('/implementation/pnpm-lock.yaml')
    )?.content;

    expect(manifest).toContain('"@agentclientprotocol/codex-acp": "1.12.0"');
    // `gpt-6-astra` needs Codex 0.153.0 or newer.
    expect(manifest).toContain('"@openai/codex": "0.155.1"');
    expect(lockfile).toContain("'@agentclientprotocol/codex-acp@1.12.0'");
    expect(lockfile).toContain("'@openai/codex@0.155.1'");
    // The patch puts per-request token usage on the wire; the frozen lockfile pins its hash.
    const patch = bootstrap?.files.find(
        (file) => file.path === '.harness-bootstrap/codex/implementation/codex-acp.patch'
    )?.content;
    expect(manifest).toContain('"@agentclientprotocol/codex-acp@1.12.0": "codex-acp.patch"');
    expect(lockfile).toContain('path: codex-acp.patch');
    expect(patch).toContain('"haus/threadTokenUsage": {');
});

test('both Codex installs share the machine store and gate on a runnable Codex CLI', async () => {
    const native = createCodexAcp({ webSearch: false });
    const bootstrap = await withCodexAcpBootstrap(native, { storeDir }).getBootstrap?.();
    const nativeBootstrap = await native.getBootstrap?.();
    const [bridgeInstall, implementationInstall] = (bootstrap?.commands ?? []).map(
        (command) => command.command
    );

    expect(bootstrap?.commands).toHaveLength(2);
    expect(bridgeInstall).toBe(
        `CI=true corepack pnpm@10.32.1 install --ignore-workspace --frozen-lockfile --store-dir "${storeDir}"`
    );
    expect(implementationInstall).toStartWith('(cd implementation && ');
    expect(implementationInstall).toContain(`--prod --store-dir "${storeDir}"`);
    expect(implementationInstall).toContain('resolve("@openai/codex/bin/codex.js")');
    // Other Agents hard-link from the shared store; a retry wipes only this install.
    expect(implementationInstall).toContain('|| (rm -rf node_modules && ');
    expect(implementationInstall).not.toContain('.pnpm-store &&');
    expect(bootstrap?.files).toContainEqual({
        content: 'haus-computer-v1\n',
        path: '.harness-bootstrap/codex/haus-computer-owner',
    });
    // Computer replaces only these two adapter installs; a new adapter step must fail here
    // rather than be dropped silently.
    expect(nativeBootstrap?.commands).toEqual([
        { command: 'pnpm install --ignore-workspace --frozen-lockfile --store-dir .pnpm-store' },
        {
            command:
                'pnpm --dir implementation install --frozen-lockfile --prod --store-dir ../.pnpm-store',
        },
    ]);
    // The adapter's files, bridge included, ship unchanged.
    for (const file of nativeBootstrap?.files ?? []) {
        expect(bootstrap?.files).toContainEqual(file);
    }
});

test('the Codex bridge steers a live turn through codex-acp session steering', async () => {
    const bootstrap = await createCodexAcp({ webSearch: false }).getBootstrap?.();
    const bridge = bootstrap?.files.find(
        (file) => file.path === '.harness-bootstrap/codex/bridge.mjs'
    )?.content;
    const adapter = await readFile(
        createRequire(import.meta.url).resolve('@ai-sdk/harness-acp'),
        'utf8'
    );

    expect(bridge).toContain('if (bridgeType === "codex") {');
    expect(bridge).toContain('connection.agent.request("_session/steering", {');
    expect(bridge).toContain('prompt: [{ type: "text", text: message.text }]');
    // A steer that lands after the turn ends starts a turn Haus does not own:
    // cancel it and leave the durable notice for the next wake.
    expect(bridge).toContain('steering?.outcome === "startedNewTurn"');
    expect(bridge).toContain('acp5.methods.agent.session.cancel');
    expect(bridge).toContain('steering?.outcome !== "injected"');
    expect(adapter).toContain('harnessId === "grok-build" || harnessId === "codex"');
});

test('Codex launch configuration follows the Agent reasoning and web access', () => {
    expect(codexAcpEnvironment({ reasoningEffort: 'high', webSearch: true })).toEqual({
        CODEX_CONFIG: '{"model_reasoning_effort":"high","web_search":"live"}',
        INITIAL_AGENT_MODE: 'agent-full-access',
        NO_BROWSER: '1',
    });
    expect(JSON.parse(codexAcpEnvironment({ webSearch: false }).CODEX_CONFIG ?? '')).toEqual({
        web_search: 'disabled',
    });
});

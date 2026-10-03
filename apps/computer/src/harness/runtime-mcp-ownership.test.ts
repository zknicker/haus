import { expect, test } from 'bun:test';
import { createHarnessForRuntime } from './runtime-harness.ts';

// Only Server MCP connections a human granted reach an Agent (specs/mcp.md). An Agent
// that edits its runtime's own MCP config must not give itself servers, so the shipped
// bridges load nothing but the servers Haus hands them.

test('the shipped Claude bridge loads only the MCP servers Haus passes', async () => {
    const bridge = await bootstrapFile('claude-code', '/bridge.mjs');
    const start = bridge.indexOf('const q = claudeSdk.query({');
    const end = bridge.indexOf('cwd: workdir', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    // Ignores ~/.claude.json, project .mcp.json, plugins, and agent frontmatter MCP.
    expect(bridge.slice(start, end)).toContain('strictMcpConfig: true');
});

test('the shipped codex-acp disables every MCP server from Codex config layers', async () => {
    const patch = await bootstrapFile('codex', '/implementation/codex-acp.patch');
    // Thread config merges into Codex's layers, so each declared server gets a disabled,
    // inert entry, and a requested server always takes its name back from config.toml.
    expect(patch).toContain('+async function readDisabledMcpServers(codexClient, cwd) {');
    expect(patch).toContain(
        '+    disabled[name] ??= isJsonObject(server) && "url" in server ? { "url": "http://127.0.0.1:9/", "enabled": false } : { "command": "false", "enabled": false };'
    );
    expect(patch).toContain(
        '+      ...await readDisabledMcpServers(this.codexClient, projectPath),'
    );
    expect(patch).toContain('-    if (shouldDeduplicateMcpConflicts()) {');
    // The ephemeral title thread gets the same treatment, and it never receives the
    // launch CODEX_CONFIG, so it switches off ChatGPT apps and plugins itself.
    expect(patch).toContain(
        '+    const disabledMcpServers = await readDisabledMcpServers(this.client, this.cwd);'
    );
    expect(patch).toContain('+      config: { "features": { "apps": false, "plugins": false },');
});

async function bootstrapFile(runtimeId: 'claude-code' | 'codex', suffix: string) {
    const bootstrap = await createHarnessForRuntime(runtimeId, 'medium').getBootstrap?.();
    const content = bootstrap?.files.find((file) => file.path.endsWith(suffix))?.content;
    if (typeof content !== 'string') {
        throw new Error(`Missing shipped ${runtimeId} bootstrap file ${suffix}`);
    }
    return content;
}

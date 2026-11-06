import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
// Most files start a Postgres cluster and a Server in `beforeAll`. Bun's 5s default also bounds
// hooks, and under machine load (App e2e running alongside) that startup can pass 5s, failing the
// file as "(fail) (unnamed)". Tests that need longer still pass their own timeout.
const testTimeoutMs = 30_000;
const testFiles = [...walk(join(root, 'test')), ...walk(join(root, 'src'))]
    .filter((file) => file.endsWith('.test.ts'))
    .sort();

// These two run a real MCP or OAuth fixture server on plain HTTP over
// loopback to prove discovery-timeout, invocation, and relay behavior end to
// end; that is exactly the local-dev case HAUS_MCP_ALLOW_PRIVATE_NETWORKS
// exists for, so only their processes opt into it.
const privateNetworkTestFiles = new Set([
    'test/haus-agent-run.test.ts',
    'test/mcp-oauth-relay.test.ts',
]);

for (const file of testFiles) {
    const display = relative(root, file);
    const env = privateNetworkTestFiles.has(display)
        ? { ...process.env, HAUS_MCP_ALLOW_PRIVATE_NETWORKS: 'true' }
        : process.env;
    const result = spawnSync('bun', ['test', '--timeout', String(testTimeoutMs), display], {
        cwd: root,
        env,
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function* walk(directory) {
    let entries;

    try {
        entries = readdirSync(directory);
    } catch {
        return;
    }

    for (const entry of entries) {
        const path = join(directory, entry);
        const stat = statSync(path);

        if (stat.isDirectory()) {
            yield* walk(path);
            continue;
        }

        yield path;
    }
}

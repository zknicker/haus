import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createEvalHarness } from './eval-harness.mjs';

const credentialPath =
    process.argv[2] ?? path.join(homedir(), '.local/share/haus-hosted-mcp/skool-connection.json');
const config = JSON.parse(await readFile(credentialPath, 'utf8'));
const harness = await createEvalHarness({ evalName: 'hosted-mcp-connect' });
try {
    const name = 'Skool';
    const connections = await harness.trpc('mcp.list', { serverId: harness.serverId });
    const savedId = config.hausConnections?.[harness.serverId];
    const existing = connections.find((entry) => entry.id === savedId);
    const connection = existing
        ? await harness.trpc('mcp.replaceHeaders', {
              connectionId: existing.id,
              headers: config.headers,
              serverId: harness.serverId,
          })
        : await harness.trpc('mcp.add', {
              auth: 'headers',
              headers: config.headers,
              name,
              oauthScopes: [],
              serverId: harness.serverId,
              url: config.url,
          });
    config.hausConnections = { ...config.hausConnections, [harness.serverId]: connection.id };
    await writeFile(credentialPath, JSON.stringify(config), { mode: 0o600 });
    process.stdout.write(
        `Connected ${name}: ${connection.tools.length} read-only tools.\n` +
            `Open Server Settings → Connections → ${name}, then grant your chosen Agent access.\n`
    );
} finally {
    await harness.cleanup();
    // The development Clerk client retains refresh timers after cleanup.
    setTimeout(() => process.exit(process.exitCode ?? 0), 0);
}

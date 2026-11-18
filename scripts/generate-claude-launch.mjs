// Generates .claude/launch.json with this checkout's deterministic dev ports.
//
// Claude Code previews read a static port from .claude/launch.json, which can
// never match per-checkout ports across worktrees — so the file is gitignored
// and regenerated per session from a SessionStart hook (see .claude/settings.json).
//
// Ports come from resolveDevPorts (scripts/dev-ports.mjs), the same source the
// dev stack uses, so the preview always attaches to the port vite actually binds.
// resolveDevPorts hashes the repo root into a four-port group, matching the
// `dev-port` helper for the same path; HAUS_DEV_PORT_BASE / HAUS_WEBSITE_PORT
// overrides flow through process.env exactly as they do for the dev stack.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDevPorts } from './dev-ports.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ports = resolveDevPorts({ repositoryRoot });

// Every dev-stack mode serves the website (vite) on the website port; the
// browser preview attaches there. Each runtimeArgs entry binds that port
// internally via run-dev-stack, so no env wiring is needed in this file.
const launch = {
    version: '0.0.1',
    configurations: [
        {
            name: 'dev',
            runtimeExecutable: 'bun',
            runtimeArgs: ['run', 'dev'],
            port: Number(ports.websitePort),
        },
        {
            name: 'dev-app',
            runtimeExecutable: 'bun',
            runtimeArgs: ['run', 'dev-app'],
            port: Number(ports.websitePort),
        },
    ],
};

const outputPath = path.join(repositoryRoot, '.claude', 'launch.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(launch, null, 2)}\n`);

process.stdout.write(`Wrote .claude/launch.json (website preview port ${ports.websitePort})\n`);

#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from './release/release-utils.mjs';

const environment = {
    ...process.env,
    HAUS_RESOLVE_RELEASE_HOST_TOKEN: 'true',
    VARLOCK_ENV: 'production',
};
const token = spawnSync('bunx', ['varlock@1.16.1', 'printenv', 'CLOUDFLARE_API_TOKEN'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: environment,
});
if (token.status !== 0 || !token.stdout.trim()) {
    console.error('CLOUDFLARE_API_TOKEN did not resolve for release-host deployment.');
    process.exit(1);
}

const wranglerEnvironment = Object.fromEntries(
    [
        'BUN_INSTALL',
        'CI',
        'FORCE_COLOR',
        'HOME',
        'HTTPS_PROXY',
        'HTTP_PROXY',
        'NO_COLOR',
        'NO_PROXY',
        'PATH',
        'SHELL',
        'TERM',
        'TMPDIR',
        'USER',
        'XDG_CONFIG_HOME',
    ].flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : []))
);
const deployed = spawnSync('bunx', ['wrangler@4.127.1', 'deploy', ...process.argv.slice(2)], {
    cwd: path.join(repoRoot, 'site/releases.haus.chat'),
    env: { ...wranglerEnvironment, CLOUDFLARE_API_TOKEN: token.stdout.trim() },
    stdio: 'inherit',
});
if (deployed.error) {
    throw deployed.error;
}
process.exit(deployed.status ?? 1);

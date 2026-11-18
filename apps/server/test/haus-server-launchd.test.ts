import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const hostServicesRoot = join(serverRoot, 'host-services');
const launchdRoot = join(serverRoot, 'launchd');
const services = ['server', 'tunnel'] as const;

test('ships valid supervised services without checked-in secret values', () => {
    const plists = services.map((service) => {
        const path = join(launchdRoot, `com.haus.${service}.plist`);
        const lint = Bun.spawnSync(['/usr/bin/plutil', '-lint', path], {
            stderr: 'pipe',
            stdout: 'pipe',
        });
        expect(lint.exitCode).toBe(0);
        const converted = Bun.spawnSync(['/usr/bin/plutil', '-convert', 'json', '-o', '-', path], {
            stderr: 'pipe',
            stdout: 'pipe',
        });
        expect(converted.exitCode).toBe(0);
        return JSON.parse(converted.stdout.toString()) as {
            EnvironmentVariables?: Record<string, string>;
            KeepAlive?: boolean;
            ProgramArguments: string[];
            RunAtLoad?: boolean;
            StandardErrorPath: string;
            StandardOutPath: string;
            UserName: string;
        };
    });

    expect(plists.map((plist) => plist.UserName)).toEqual(['_haus_server', '_haus_tunnel']);
    expect(plists[1]?.ProgramArguments).toContain('401d3f59-5e0a-43e8-bd1a-b29237e9cc74');
    expect(plists[1]?.ProgramArguments).toContain('127.0.0.1:20242');
    expect(plists.filter((plist) => plist.RunAtLoad)).toHaveLength(2);
    expect(plists.filter((plist) => plist.KeepAlive)).toHaveLength(2);
    for (const plist of plists) {
        expect(plist.StandardOutPath).toStartWith('/Users/zknicker/srv/haus/logs/');
        expect(plist.StandardErrorPath).toStartWith('/Users/zknicker/srv/haus/logs/');
        // The rendered config/server.env is the one delivery surface. A value
        // set here would silently outrank the committed contract.
        expect(plist.EnvironmentVariables).toBeUndefined();
    }
    expect(plists[0]?.ProgramArguments).toContain(
        '/Users/zknicker/srv/haus/current/operations/run-server'
    );
    expect(plists[1]?.ProgramArguments).toContain(
        '/Users/zknicker/srv/haus/config/cloudflared.yml'
    );
    expect(JSON.stringify(plists)).not.toContain('postgres://');
});

test('starts the Server from its rendered environment without re-entering varlock', () => {
    const runServer = readFileSync(join(serverRoot, 'operations', 'run-server'), 'utf8');
    const commands = runServer
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n');

    expect(runServer).toContain('. "/Users/zknicker/srv/haus/config/server.env"');
    expect(runServer).toContain('exec /Users/zknicker/srv/haus/current/bin/haus-server');
    // launchd stores a command line, and the package scripts wrap themselves in
    // `varlock run`. A production service that re-entered varlock would resolve
    // the schema again at boot, under the development lifecycle.
    expect(commands).not.toContain('varlock');
    expect(commands).not.toContain('bun run');
    // Every value below comes from the rendered file now; a stray export here
    // would be a second owner.
    expect(commands).not.toContain('export HAUS_');
});

test('ships one narrow activation privilege rule without automatic installation', () => {
    const sudoers = readFileSync(join(hostServicesRoot, 'haus-server-activation.sudoers'), 'utf8');

    expect(sudoers).toBe(
        'zknicker ALL=(root) NOPASSWD: /usr/local/libexec/haus/activate-haus-server\n'
    );
    expect(sudoers).not.toContain('/bin/sh');
    expect(sudoers).not.toContain('/usr/bin/env');
    expect(sudoers).not.toContain('*');
});

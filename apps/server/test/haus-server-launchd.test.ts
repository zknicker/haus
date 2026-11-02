import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

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
    expect(JSON.stringify(plists)).not.toContain('hc-ping.com');
    expect(JSON.stringify(plists)).not.toContain('/opt/haus-server');
    expect(JSON.stringify(plists)).not.toContain('/Library/Application Support/Haus');
});

test('retires the backup and monitor services entirely', () => {
    for (const label of ['backup', 'monitor']) {
        expect(existsSync(join(launchdRoot, `com.haus.${label}.plist`))).toBe(false);
    }
    for (const operation of ['run-backup', 'run-restore']) {
        expect(existsSync(join(serverRoot, 'operations', operation))).toBe(false);
    }
});

test('ships one private PostgreSQL Compose service with durable state', () => {
    const composeText = readFileSync(join(serverRoot, 'compose.yml'), 'utf8');
    const compose = parse(composeText) as {
        name: string;
        services: Record<string, Record<string, unknown>>;
        volumes: Record<string, { name: string }>;
    };
    const postgres = compose.services.postgres;

    expect(compose.name).toBe('haus');
    expect(Object.keys(compose.services)).toEqual(['postgres']);
    expect(postgres?.container_name).toBe('haus-postgres');
    expect(postgres?.image).toBe(
        'postgres:16.14-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'
    );
    expect(postgres?.ports).toEqual(['127.0.0.1:5438:5432']);
    expect(postgres?.restart).toBe('unless-stopped');
    expect(postgres?.stop_signal).toBe('SIGINT');
    expect(postgres?.sysctls).toEqual({ 'net.mptcp.enabled': '0' });
    expect(postgres?.volumes).toEqual(['postgres_data:/var/lib/postgresql/data']);
    expect(compose.volumes.postgres_data?.name).toBe('haus_postgres_data');
    expect((postgres?.environment as Record<string, string>).POSTGRES_PASSWORD).toBe(
        ['$', '{HAUS_POSTGRES_ADMIN_PASSWORD:?HAUS_POSTGRES_ADMIN_PASSWORD is required}'].join('')
    );
    expect(composeText).not.toContain('POSTGRES_HOST_AUTH_METHOD');
    expect(composeText).not.toContain('GENERATE_ON_HOST');
});

test('keeps production state and credentials inside the canonical srv root', () => {
    const files = [
        ...services.map((service) => join(launchdRoot, `com.haus.${service}.plist`)),
        join(serverRoot, 'config', 'cloudflared.yml.example'),
        join(serverRoot, 'operations', 'run-server'),
    ];
    const source = files.map((path) => readFileSync(path, 'utf8')).join('\n');

    expect(source).toContain('/Users/zknicker/srv/haus/current');
    expect(source).toContain('/Users/zknicker/srv/haus/config');
    expect(source).toContain('/Users/zknicker/srv/haus/logs');
    expect(source).not.toContain('/opt/haus-server');
    expect(source).not.toContain('/Library/Application Support/Haus');
    expect(source).not.toContain('/var/db/haus-server');
    expect(source).not.toContain('/var/log/haus-server');
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

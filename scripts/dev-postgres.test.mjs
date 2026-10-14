import assert from 'node:assert/strict';
import test from 'node:test';
import { postgresLocaleEnvironment, stopStaleDevPostgres } from './dev-postgres.mjs';

test('stopStaleDevPostgres stops the postmaster for the managed data root', () => {
    const calls = [];
    const environment = {
        HAUS_POSTGRES_DATA_ROOT: '/managed/postgres',
    };

    const cleanupCount = stopStaleDevPostgres(environment, {
        binaries: { pgCtl: '/postgres/bin/pg_ctl' },
        uid: 501,
        fileSystem: {
            existsSync: (filePath) => filePath === '/managed/postgres/postmaster.pid',
        },
        spawnCommand: (command, args, options) => {
            calls.push({ args, command, options });
            return { status: 0 };
        },
    });

    assert.equal(cleanupCount, 1);
    assert.deepEqual(calls, [
        {
            args: ['--pgdata', '/managed/postgres', 'status'],
            command: '/postgres/bin/pg_ctl',
            options: { encoding: 'utf8' },
        },
        {
            args: ['--pgdata', '/managed/postgres', '--mode', 'fast', '--wait', 'stop'],
            command: '/postgres/bin/pg_ctl',
            options: { encoding: 'utf8' },
        },
    ]);
});

test('stopStaleDevPostgres is a no-op without a postmaster', () => {
    const cleanupCount = stopStaleDevPostgres(
        { HAUS_POSTGRES_DATA_ROOT: '/managed/postgres' },
        {
            fileSystem: { existsSync: () => false },
            spawnCommand: () => {
                throw new Error('should not spawn');
            },
        }
    );

    assert.equal(cleanupCount, 0);
});

test('stopStaleDevPostgres leaves a dead postmaster lock for PostgreSQL recovery', () => {
    const calls = [];
    const cleanupCount = stopStaleDevPostgres(
        { HAUS_POSTGRES_DATA_ROOT: '/managed/postgres' },
        {
            binaries: { pgCtl: '/postgres/bin/pg_ctl' },
            fileSystem: { existsSync: () => true },
            uid: 501,
            spawnCommand: (_command, args) => {
                calls.push(args);
                return { status: 3 };
            },
        }
    );

    assert.equal(cleanupCount, 0);
    assert.deepEqual(calls, [['--pgdata', '/managed/postgres', 'status']]);
});

test('postgresLocaleEnvironment supplies a locale when the shell has none', () => {
    assert.deepEqual(postgresLocaleEnvironment({}), { LANG: 'C', LC_ALL: 'C' });
});

test('postgresLocaleEnvironment keeps an existing locale', () => {
    assert.deepEqual(postgresLocaleEnvironment({ LANG: 'en_US.UTF-8' }), {});
    assert.deepEqual(postgresLocaleEnvironment({ LC_ALL: 'en_US.UTF-8' }), {});
});

test('stopStaleDevPostgres runs pg_ctl as the server account on a root host', () => {
    const calls = [];
    stopStaleDevPostgres(
        { HAUS_POSTGRES_DATA_ROOT: '/managed/postgres' },
        {
            binaries: { pgCtl: '/postgres/bin/pg_ctl' },
            fileSystem: { existsSync: () => true },
            spawnCommand: (command, args) => {
                calls.push([command, ...args]);
                return { status: 3 };
            },
            uid: 0,
        }
    );

    assert.deepEqual(calls, [
        [
            'setpriv',
            '--reuid=postgres',
            '--regid=postgres',
            '--init-groups',
            '--',
            '/postgres/bin/pg_ctl',
            '--pgdata',
            '/managed/postgres',
            'status',
        ],
    ]);
});

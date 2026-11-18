import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { postgresServerCommand, postgresServerPath } from './postgres-server-account.mjs';

test('postgresServerCommand runs server binaries directly for an unprivileged user', () => {
    assert.deepEqual(postgresServerCommand('/pg/bin/initdb', ['--pgdata', '/data'], 501), {
        args: ['--pgdata', '/data'],
        command: '/pg/bin/initdb',
    });
});

test('postgresServerCommand drops to the postgres account on a root host', () => {
    assert.deepEqual(postgresServerCommand('/pg/bin/postgres', ['-D', '/data'], 0), {
        args: [
            '--reuid=postgres',
            '--regid=postgres',
            '--init-groups',
            '--',
            '/pg/bin/postgres',
            '-D',
            '/data',
        ],
        command: 'setpriv',
    });
});

test('postgresServerPath keeps state paths for an unprivileged user', () => {
    const directory = path.join(os.homedir(), '.haus', 'dev', 'alpha', 'postgres');
    assert.equal(postgresServerPath(directory, 501), directory);
});

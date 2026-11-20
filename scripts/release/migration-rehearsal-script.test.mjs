import assert from 'node:assert/strict';
import test from 'node:test';
import { migrationRehearsalScript, pendingMigrationTags } from './migration-rehearsal-script.mjs';

test('pending migrations are the journal entries newer than the newest applied one', () => {
    const journal = {
        entries: [
            { tag: '0128_threads-are-gone', when: 100 },
            { tag: '0129_drive', when: 200 },
            { tag: '0130_channels-are-projects', when: 300 },
        ],
    };
    assert.deepEqual(pendingMigrationTags(journal, 100), [
        '0129_drive',
        '0130_channels-are-projects',
    ]);
    assert.deepEqual(pendingMigrationTags(journal, 300), []);
});

test('the rehearsal applies every pending statement in one transaction, checks, and rolls back', () => {
    assert.equal(
        migrationRehearsalScript([
            {
                tag: '0135_workers',
                sql: 'SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint\nCREATE TABLE "w" ("id" text);--> statement-breakpoint\nSET CONSTRAINTS ALL DEFERRED;\n',
            },
            { tag: '0142_all-is-a-chat', sql: 'DO $$ BEGIN PERFORM 1; END $$' },
        ]),
        [
            'BEGIN;',
            "DO $rehearsal$ BEGIN RAISE NOTICE 'rehearsal: applying 0135_workers'; END $rehearsal$;",
            'SET CONSTRAINTS ALL IMMEDIATE;',
            'CREATE TABLE "w" ("id" text);',
            'SET CONSTRAINTS ALL DEFERRED;',
            "DO $rehearsal$ BEGIN RAISE NOTICE 'rehearsal: applying 0142_all-is-a-chat'; END $rehearsal$;",
            'DO $$ BEGIN PERFORM 1; END $$\n;',
            "DO $rehearsal$ BEGIN RAISE NOTICE 'rehearsal: checking every deferred constraint'; END $rehearsal$;",
            'SET CONSTRAINTS ALL IMMEDIATE;',
            'ROLLBACK;',
            '',
        ].join('\n')
    );
});

test('a tag that could break out of the notice is refused', () => {
    assert.throws(
        () => migrationRehearsalScript([{ tag: "0001_x'; DROP", sql: 'SELECT 1;' }]),
        /unexpected migration tag/u
    );
});

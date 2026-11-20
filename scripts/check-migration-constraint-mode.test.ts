import { describe, expect, test } from 'bun:test';
import {
    constraintsLeftImmediate,
    evaluateMigrationConstraintModes,
} from './check-migration-constraint-mode';

const breakpoint = '--> statement-breakpoint\n';

describe('migration constraint mode', () => {
    test('accepts migrations that restore DEFERRED or never touch the mode', () => {
        expect(
            evaluateMigrationConstraintModes(
                [
                    {
                        path: 'm/0130_restores.sql',
                        sql: `SET CONSTRAINTS ALL IMMEDIATE;${breakpoint}UPDATE t SET a = 1;${breakpoint}SET CONSTRAINTS ALL DEFERRED;\n`,
                    },
                    {
                        path: 'm/0142_checks_midway.sql',
                        sql: `SET CONSTRAINTS ALL DEFERRED;${breakpoint}set constraints all immediate;${breakpoint}set   constraints all deferred;${breakpoint}ALTER TABLE t ADD c int;\n`,
                    },
                    {
                        path: 'm/0115_named.sql',
                        sql: `SET CONSTRAINTS "a_fk", "b_fk" IMMEDIATE;${breakpoint}SET CONSTRAINTS "a_fk", "b_fk" DEFERRED;\n`,
                    },
                    { path: 'm/0001_plain.sql', sql: 'CREATE TABLE t (a int);\n' },
                    {
                        path: 'm/0007_legacy.sql',
                        sql: `SET CONSTRAINTS ALL IMMEDIATE;${breakpoint}DROP TABLE t;\n`,
                    },
                ],
                new Set(['0007_legacy.sql'])
            )
        ).toEqual([]);
    });

    test('rejects migrations that leave constraints IMMEDIATE for the rest of the chain', () => {
        expect(
            evaluateMigrationConstraintModes(
                [
                    {
                        path: 'm/0135_leaks.sql',
                        sql: `SET CONSTRAINTS ALL IMMEDIATE;${breakpoint}ALTER TABLE t RENAME TO u;\n`,
                    },
                    {
                        path: 'm/0150_reimmediate.sql',
                        sql: `SET CONSTRAINTS ALL IMMEDIATE;${breakpoint}SET CONSTRAINTS ALL DEFERRED;${breakpoint}SET CONSTRAINTS ALL IMMEDIATE;\n`,
                    },
                    {
                        path: 'm/0151_named.sql',
                        sql: `SET CONSTRAINTS "a_fk" IMMEDIATE;\n`,
                    },
                ],
                new Set()
            )
        ).toEqual([
            'm/0135_leaks.sql: SET CONSTRAINTS ALL IMMEDIATE needs a later SET CONSTRAINTS ALL DEFERRED; pending migrations share one transaction',
            'm/0150_reimmediate.sql: SET CONSTRAINTS ALL IMMEDIATE needs a later SET CONSTRAINTS ALL DEFERRED; pending migrations share one transaction',
            'm/0151_named.sql: SET CONSTRAINTS "A_FK" IMMEDIATE needs a later SET CONSTRAINTS "A_FK" DEFERRED; pending migrations share one transaction',
        ]);
    });

    test('ignores SET CONSTRAINTS inside line comments', () => {
        expect(constraintsLeftImmediate('-- SET CONSTRAINTS ALL IMMEDIATE;\nSELECT 1;\n')).toEqual(
            []
        );
    });

    test('keeps the grandfathered list exact', () => {
        expect(
            evaluateMigrationConstraintModes(
                [{ path: 'm/0007_fixed.sql', sql: 'SET CONSTRAINTS ALL DEFERRED;\n' }],
                new Set(['0007_fixed.sql', '0008_gone.sql'])
            )
        ).toEqual([
            '0008_gone.sql: grandfathered migration has no matching file',
            'm/0007_fixed.sql: restores DEFERRED; remove it from the grandfathered list',
        ]);
    });
});

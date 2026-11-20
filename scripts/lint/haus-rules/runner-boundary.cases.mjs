import { testRule } from './rule-tester.mjs';
import { runnerBoundary } from './runner-boundary.mjs';

const runnerFile = 'apps/runner/src/index.ts';
const deepRunnerFile = 'apps/runner/src/claude/session.ts';

testRule('runner-boundary', runnerBoundary, {
    valid: [
        { code: "import { z } from 'zod';", filename: runnerFile },
        { code: "import { api } from './api.ts';", filename: runnerFile },
        { code: "import { api } from '@haus/api';", filename: runnerFile },
        { code: "import { x } from '../../../runner/src/x.ts';", filename: deepRunnerFile },
        { code: 'const pool = Bun.sql;', filename: 'apps/server/src/db.ts' },
        { code: "import postgres from 'postgres';", filename: 'apps/server/src/db.ts' },
        {
            code: "import { db } from '../../server/src/db.ts';",
            filename: 'apps/computer/src/x.ts',
        },
        { code: 'const x = Bun.file("a");', filename: runnerFile },
        { code: "import { file, spawn } from 'bun';", filename: runnerFile },
        { code: "import { SQL } from 'bun';", filename: 'apps/server/src/db.ts' },
        { code: "import * as runtime from 'bun';\nconst f = runtime.file;", filename: runnerFile },
    ],
    invalid: [
        {
            code: "import { db } from '../../server/src/db.ts';",
            filename: runnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "import { db } from '../../../server/src/db.ts';",
            filename: deepRunnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "import { env } from '../../server/src/config/env.ts';",
            filename: runnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "import { x } from '@haus/server';",
            filename: runnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "import { x } from '@haus/server/src/x.ts';",
            filename: runnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "export * from '../../server/src/x.ts';",
            filename: runnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "export { x } from '../../server/src/x.ts';",
            filename: runnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "const m = await import('../../server/src/x.ts');",
            filename: runnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "const m = require('../../server/src/x.ts');",
            filename: runnerFile,
            errors: [{ messageId: 'serverImport' }],
        },
        {
            code: "import postgres from 'postgres';",
            filename: runnerFile,
            errors: [{ messageId: 'databaseClient' }],
        },
        {
            code: "import { Pool } from 'pg';",
            filename: runnerFile,
            errors: [{ messageId: 'databaseClient' }],
        },
        {
            code: "import native from 'pg-native';",
            filename: runnerFile,
            errors: [{ messageId: 'databaseClient' }],
        },
        {
            code: "import { drizzle } from 'drizzle-orm/postgres-js';",
            filename: runnerFile,
            errors: [{ messageId: 'databaseClient' }],
        },
        {
            code: "import { neon } from '@neondatabase/serverless';",
            filename: runnerFile,
            errors: [{ messageId: 'databaseClient' }],
        },
        {
            code: "import { sql } from 'bun:sql';",
            filename: runnerFile,
            errors: [{ messageId: 'databaseClient' }],
        },
        {
            code: 'const db = Bun.sql;',
            filename: runnerFile,
            errors: [{ messageId: 'bunSql' }],
        },
        {
            code: 'const db = new Bun.SQL(url);',
            filename: runnerFile,
            errors: [{ messageId: 'bunSql' }],
        },
        {
            code: "import { SQL } from 'bun';",
            filename: runnerFile,
            errors: [{ messageId: 'bunSql' }],
        },
        {
            code: "import { sql } from 'bun';",
            filename: runnerFile,
            errors: [{ messageId: 'bunSql' }],
        },
        {
            code: "import { file, SQL as Database } from 'bun';",
            filename: runnerFile,
            errors: [{ messageId: 'bunSql' }],
        },
        {
            code: "import * as runtime from 'bun';\nconst db = runtime.sql;",
            filename: runnerFile,
            errors: [{ messageId: 'bunSql' }],
        },
        {
            code: "import runtime from 'bun';\nconst db = new runtime.SQL(url);",
            filename: runnerFile,
            errors: [{ messageId: 'bunSql' }],
        },
    ],
});

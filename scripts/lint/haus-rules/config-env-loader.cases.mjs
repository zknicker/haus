import { configEnvLoader } from './config-env-loader.mjs';
import { testRule } from './rule-tester.mjs';

const configFile = 'apps/server/src/config/env.ts';

testRule('config-env-loader', configEnvLoader, {
    valid: [
        { code: "import { z } from 'zod';", filename: configFile },
        { code: "import { readFileSync } from 'node:fs';", filename: 'apps/server/src/server.ts' },
    ],
    invalid: [
        {
            code: "import { readFileSync } from 'node:fs';",
            filename: configFile,
            errors: [{ messageId: 'envLoader' }],
        },
        {
            code: "import { readFileSync } from 'fs';",
            filename: configFile,
            errors: [{ messageId: 'envLoader' }],
        },
        {
            code: "import 'dotenv/config';",
            filename: configFile,
            errors: [{ messageId: 'envLoader' }],
        },
        {
            code: "import { config } from 'dotenv';",
            filename: configFile,
            errors: [{ messageId: 'envLoader' }],
        },
    ],
});

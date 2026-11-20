import { computerNoModelCalls } from './computer-no-model-calls.mjs';
import { testRule } from './rule-tester.mjs';

const computerFile = 'apps/computer/src/worker.ts';
const allow = { 'apps/computer/src/worker.ts': 'Workers keep native harnesses' };

testRule('computer-no-model-calls', computerNoModelCalls, {
    valid: [
        { code: "import { z } from 'zod';", filename: computerFile },
        { code: "import { x } from 'aim';", filename: computerFile },
        { code: "const url = 'https://example.com/api';", filename: computerFile },
        {
            code: "const url = 'https://api.anthropic.com';",
            filename: 'apps/computer/src/worker.test.ts',
        },
        {
            code: "import { Anthropic } from '@anthropic-ai/sdk';",
            filename: 'apps/runner/src/a.ts',
        },
        { code: "const url = 'https://api.openai.com/v1';", filename: 'apps/server/src/a.ts' },
        {
            code: "import { Anthropic } from '@anthropic-ai/sdk';",
            filename: computerFile,
            options: [{ allow }],
        },
    ],
    invalid: [
        {
            code: "import { Anthropic } from '@anthropic-ai/sdk';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "import { query } from '@anthropic-ai/claude-agent-sdk';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "import OpenAI from 'openai';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "import { generateText } from 'ai';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "import { openai } from '@ai-sdk/openai';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "import { GoogleGenAI } from '@google/genai';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "import { getModel } from '@mariozechner/pi-ai';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "import { Agent } from '@mariozechner/pi-agent-core';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "import { x } from '@earendil-works/pi-coding-agent';",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "const m = await import('openai');",
            filename: computerFile,
            errors: [{ messageId: 'modelSdk' }],
        },
        {
            code: "const url = 'https://api.anthropic.com/v1/messages';",
            filename: computerFile,
            errors: [{ messageId: 'modelHost' }],
        },
        {
            code: 'const url = `https://api.x.ai/v1/models`;',
            filename: computerFile,
            errors: [{ messageId: 'modelHost' }],
        },
        {
            code: "const url = 'https://openrouter.ai/api/v1';",
            filename: computerFile,
            errors: [{ messageId: 'modelHost' }],
        },
        {
            code: "const url = 'https://generativelanguage.googleapis.com/v1';",
            filename: computerFile,
            errors: [{ messageId: 'modelHost' }],
        },
        {
            code: "import { z } from 'zod';",
            filename: computerFile,
            options: [{ allow }],
            errors: [{ messageId: 'staleAllowance' }],
        },
    ],
});

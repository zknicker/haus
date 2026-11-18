import { testRule } from './rule-tester.mjs';
import { updateRequiredCode } from './update-required-code.mjs';

const serverFile = 'apps/server/src/haus-api/tasks/create.ts';

testRule('update-required-code', updateRequiredCode, {
    valid: [
        {
            code: "throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'update' });",
            filename: 'apps/server/src/haus-api/trpc.ts',
        },
        {
            code: "const code = 'PRECONDITION_FAILED';",
            filename: 'apps/server/src/haus-api/app-protocol.test.ts',
        },
        { code: "const code = 'PRECONDITION_FAILED';", filename: 'apps/server/lint/probe.ts' },
        {
            code: "throw new TRPCError({ code: 'BAD_REQUEST', message: 'not configured' });",
            filename: serverFile,
        },
    ],
    invalid: [
        {
            code: "throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'not configured' });",
            filename: serverFile,
            errors: [{ messageId: 'updateRequired' }],
        },
        {
            code: "const code = 'PRECONDITION_FAILED';",
            filename: serverFile,
            errors: [{ messageId: 'updateRequired' }],
        },
    ],
});

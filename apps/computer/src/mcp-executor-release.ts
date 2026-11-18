import { executeMcpCode } from '@haus/mcp-executor';
import * as z from 'zod';
import { computerEntrypoint } from './build-identity.ts';

/** Exercises the embedded WASM and the actual re-exec path in a compiled release. */
export async function validateMcpExecutor() {
    const entrypoint = computerEntrypoint();
    const result = await executeMcpCode({
        code: 'return await tools.check({value: 42});',
        command: { ...entrypoint, args: [...entrypoint.args, '__mcp-executor'] },
        invoke: async ({ args }) => z.object({ value: z.number() }).parse(args).value,
        signal: AbortSignal.timeout(10_000),
    });
    z.object({ result: z.literal(42) }).parse(result);
}

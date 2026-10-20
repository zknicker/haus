import * as z from 'zod';
import { defineHostTool } from '../../../host-tools/host-tool.ts';

/** The host tool the fixtures and the live test call: it answers `echo:<text>`. */
export const echoHostTool = defineHostTool({
    description: 'Echoes text back, prefixed with "echo:".',
    execute: async (input) => ({ text: `echo:${input.text}`, type: 'text' }),
    inputSchema: z.object({ text: z.string() }),
    name: 'echo',
});

import * as z from 'zod';
import { mcpIconSchema, mcpPresetSchema } from './mcp.ts';

export const mcpPresetIconCatalogSchema = z.array(
    z.object({ icon: mcpIconSchema.nullable(), preset: mcpPresetSchema }).strict()
);

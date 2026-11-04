import * as z from 'zod';

/** Server-scoped Server→Computer commands: they name no Agent and apply to the whole attachment. */

/** Best-effort instruction to erase this Server attachment's Computer-local state. */
export const serverDeleteCommandSchema = z.object({ type: z.literal('server-delete') }).strict();

export type ServerDeleteCommand = z.infer<typeof serverDeleteCommandSchema>;

/**
 * The Server's settings a Computer's runtimes follow, sent on every attach and every change
 * (replace semantics). Until the first arrives, every setting is off.
 */
export const serverRuntimeSettingsCommandSchema = z
    .object({
        idleCompaction: z.boolean(),
        type: z.literal('server-runtime-settings'),
    })
    .strict();

export type ServerRuntimeSettingsCommand = z.infer<typeof serverRuntimeSettingsCommandSchema>;

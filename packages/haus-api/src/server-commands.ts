import * as z from 'zod';

/** Server-scoped Server→Computer commands: they name no Agent and apply to the whole attachment. */

/** Best-effort instruction to erase this Server attachment's Computer-local state. */
export const serverDeleteCommandSchema = z.object({ type: z.literal('server-delete') }).strict();

export type ServerDeleteCommand = z.infer<typeof serverDeleteCommandSchema>;

/**
 * The Server's settings a Computer's runtimes follow (replace semantics), sent on every change
 * and on attach while one is on. A Computer holds every setting off until a frame turns it on,
 * and again whenever its attachment socket closes.
 */
export const serverRuntimeSettingsCommandSchema = z
    .object({
        idleCompaction: z.boolean(),
        type: z.literal('server-runtime-settings'),
    })
    .strict();

export type ServerRuntimeSettingsCommand = z.infer<typeof serverRuntimeSettingsCommandSchema>;

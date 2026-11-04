import * as z from 'zod';
import { idSchema } from './chat.ts';

/**
 * Server-wide settings an Owner turns on for every Agent on the Server. Every member reads them;
 * only an Owner changes them. Runtime settings reach each attached Computer as one
 * `server-runtime-settings` frame (`server-commands.ts`), on attach and on every change.
 */
export const serverSettingsSchema = z
    .object({
        /**
         * Compact a parked Claude Code session shortly before its one-hour prompt cache expires,
         * as Claude Code does on its own (specs/runtime-drivers.md "Idle compaction"). Off by
         * default: a launch gate.
         */
        idleCompaction: z.boolean(),
    })
    .strict();

export type ServerSettings = z.infer<typeof serverSettingsSchema>;

export const serverSettingsGetInputSchema = z.object({ serverId: idSchema }).strict();

export const serverSettingsSetIdleCompactionInputSchema = z
    .object({ idleCompaction: z.boolean(), serverId: idSchema })
    .strict();

export type ServerSettingsSetIdleCompactionInput = z.infer<
    typeof serverSettingsSetIdleCompactionInputSchema
>;

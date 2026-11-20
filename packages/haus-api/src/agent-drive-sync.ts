import * as z from 'zod';
import { idSchema } from './chat.ts';

export const drivePullCommandSchema = z
    .object({
        agentId: idSchema,
        runId: idSchema,
        sessionGeneration: z.number().int().positive(),
        type: z.literal('drive-pull'),
    })
    .strict();

export type DrivePullCommand = z.infer<typeof drivePullCommandSchema>;

export const drivePushCommandSchema = z
    .object({
        agentId: idSchema,
        runId: idSchema,
        sessionGeneration: z.number().int().positive(),
        type: z.literal('drive-push'),
    })
    .strict();

export type DrivePushCommand = z.infer<typeof drivePushCommandSchema>;

export const driveSyncCommandSchemas = [drivePullCommandSchema, drivePushCommandSchema] as const;

export type DriveSyncCommand = DrivePullCommand | DrivePushCommand;

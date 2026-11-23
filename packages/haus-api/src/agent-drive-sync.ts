import * as z from 'zod';
import { idSchema } from './chat.ts';

const placementGenerationSchema = z.number().int().nonnegative();

export const drivePullCommandSchema = z
    .object({
        agentId: idSchema,
        placementGeneration: placementGenerationSchema,
        runId: idSchema,
        sessionGeneration: z.number().int().positive(),
        type: z.literal('drive-pull'),
    })
    .strict();

export type DrivePullCommand = z.infer<typeof drivePullCommandSchema>;

export const drivePushCommandSchema = z
    .object({
        agentId: idSchema,
        placementGeneration: placementGenerationSchema,
        runId: idSchema,
        sessionGeneration: z.number().int().positive(),
        type: z.literal('drive-push'),
    })
    .strict();

export type DrivePushCommand = z.infer<typeof drivePushCommandSchema>;

/**
 * A Machine change asks the old Machine to push its folder under `flushId` and close that push
 * even when nothing changed. The close is the Server's proof that the folder reached Drive, so
 * only then does the Machine change.
 */
export const driveFlushCommandSchema = z
    .object({
        agentId: idSchema,
        flushId: idSchema,
        placementGeneration: placementGenerationSchema,
        sessionGeneration: z.number().int().positive(),
        type: z.literal('drive-flush'),
    })
    .strict();

export type DriveFlushCommand = z.infer<typeof driveFlushCommandSchema>;

export const driveSyncCommandSchemas = [
    drivePullCommandSchema,
    drivePushCommandSchema,
    driveFlushCommandSchema,
] as const;

export type DriveSyncCommand = DriveFlushCommand | DrivePullCommand | DrivePushCommand;

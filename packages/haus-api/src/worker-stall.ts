import * as z from 'zod';

/**
 * Why a live Run is stuck without settling. A stall is neither a status nor an
 * error: Computer keeps retrying underneath it, and the delegating Agent gets a
 * notice with sparse reminders.
 */
export const workerStallCodes = [
    'followup-auto-interrupt-failed',
    'claude-prompt-not-found',
] as const;

export const workerStallCodeSchema = z.enum(workerStallCodes);

export type WorkerStallCode = z.infer<typeof workerStallCodeSchema>;

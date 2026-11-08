import * as z from 'zod';

/**
 * Why a live Run is stuck without settling. A stall is neither a status nor an
 * error: Computer keeps retrying underneath it, and the delegating Agent gets a
 * notice with sparse reminders.
 */
export const cloudAgentStallCodes = [
    'followup-auto-interrupt-failed',
    'claude-prompt-not-found',
] as const;

export const cloudAgentStallCodeSchema = z.enum(cloudAgentStallCodes);

export type CloudAgentStallCode = z.infer<typeof cloudAgentStallCodeSchema>;

import * as z from 'zod';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const hausAgentStatusSchema = z.enum(['current', 'failed', 'pending']);

export type HausAgentStatus = z.infer<typeof hausAgentStatusSchema>;

export const hausAgentStateSchema = z
    .object({
        appliedAt: timestampSchema.nullable(),
        appliedVersion: z
            .string()
            .regex(/^\d+\.\d+\.\d+$/u)
            .nullable(),
        currentVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
        status: hausAgentStatusSchema,
    })
    .strict();

export type HausAgentState = z.infer<typeof hausAgentStateSchema>;

export const hausAgentAppliedStateSchema = z
    .object({
        agentId: idSchema,
        appliedAt: timestampSchema.nullable(),
        status: hausAgentStatusSchema,
        version: z
            .string()
            .regex(/^\d+\.\d+\.\d+$/u)
            .nullable(),
    })
    .strict();

export type HausAgentAppliedState = z.infer<typeof hausAgentAppliedStateSchema>;

/** Additive Computer frame kept separate from the legacy strict effective-state report. */
export const hausAgentReportFrameSchema = z
    .object({
        agents: z.array(hausAgentAppliedStateSchema).max(500),
        type: z.literal('haus-agent-report'),
    })
    .strict();

export type HausAgentReportFrame = z.infer<typeof hausAgentReportFrameSchema>;

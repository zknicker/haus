import * as z from 'zod';
import { channelTargetSchema } from './agent-creation.ts';
import { channelDescriptionMaxLength, channelDescriptionSchema } from './channel-description.ts';
import { participantHandleSchema } from './participant-handle.ts';

/** A new channel's bare name: what follows the `#` in its target. */
export const agentChannelNameSchema = z
    .string()
    .trim()
    .regex(
        /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u,
        'A channel name is 1-32 letters, numbers, hyphens, or underscores, starting with a letter or number.'
    );

/**
 * `haus channel create`: an Agent opens a channel, as any Server member may.
 * The creating Agent is its first Agent member. A human sees a channel only as
 * its participant, so `humans` names at least one human, by `@handle`, who
 * joins it too: the person who asked for it, never anyone on a guess.
 */
export const agentCreateChannelInputSchema = z
    .object({
        description: z.string().trim().min(1).max(channelDescriptionMaxLength).optional(),
        humans: z
            .array(z.string().trim().min(1).max(64))
            .min(1, 'Name at least one human who should see the channel.')
            .max(10),
        name: agentChannelNameSchema,
    })
    .strict();

export type AgentCreateChannelInput = z.infer<typeof agentCreateChannelInputSchema>;

export const agentCreateChannelReceiptSchema = z
    .object({
        description: channelDescriptionSchema.nullable(),
        /** The humans now in the channel, by handle, sorted. */
        humans: z.array(participantHandleSchema),
        target: channelTargetSchema,
    })
    .strict();

export type AgentCreateChannelReceipt = z.infer<typeof agentCreateChannelReceiptSchema>;

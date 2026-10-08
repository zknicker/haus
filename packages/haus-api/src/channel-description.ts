import * as z from 'zod';
import { channelColorSchema, channelIconSchema } from './channel-appearance.ts';

/** A channel's purpose, shown to people and to Agents in `haus server info`. */
export const channelDescriptionMaxLength = 500;

/** The stored shape: never blank, so absence is always `null`. */
export const channelDescriptionSchema = z.string().min(1).max(channelDescriptionMaxLength);

/**
 * Edit input: trimmed, and an empty field clears the description. `undefined`
 * leaves the stored description alone.
 */
export const channelDescriptionInputSchema = z
    .string()
    .trim()
    .max(channelDescriptionMaxLength)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

/** The optional fields a channel create or update may set; `null` clears one. */
export const channelEditInputFields = {
    color: channelColorSchema.nullable().optional(),
    description: channelDescriptionInputSchema,
    icon: channelIconSchema.nullable().optional(),
};

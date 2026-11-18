import { z } from 'zod';
import { idSchema } from './chat.ts';

export const voiceCallInputSchema = z.object({ serverId: idSchema, chatId: idSchema }).strict();

/** Foreground iPhone call transport. Audio is mono PCM16 little-endian at 24 kHz. */
export const voiceClientEventSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('audio'),
            audio: z
                .string()
                .min(4)
                .max(32_000)
                .regex(/^[A-Za-z0-9+/]+={0,2}$/u),
        })
        .strict(),
    z.object({ type: z.literal('mute'), muted: z.boolean() }).strict(),
    z.object({ type: z.literal('close') }).strict(),
]);

export const voiceServerEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('ready'), agentName: z.string(), model: z.literal('gpt-live-1') }),
    z.object({ type: z.literal('audio'), audio: z.string() }),
    z.object({
        type: z.literal('transcript'),
        speaker: z.enum(['user', 'assistant']),
        text: z.string(),
    }),
    z.object({ type: z.literal('error'), message: z.string() }),
    z.object({ type: z.literal('closed') }),
]);

export type VoiceServerEvent = z.infer<typeof voiceServerEventSchema>;

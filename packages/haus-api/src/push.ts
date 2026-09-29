import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * iPhone push (APNs). A device registers its token for the signed-in human;
 * Server sends one alert per message that newly addresses that human under the
 * Needs you rules (ADR 0037). Registration is per human, not per Server: a
 * device receives pushes from every Server the human belongs to.
 */
export const pushEnvironments = ['sandbox', 'production'] as const;

export type PushEnvironment = (typeof pushEnvironments)[number];

/** APNs device tokens are hex; Server stores them lowercase. */
export const pushDeviceTokenSchema = z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64,200}$/u, 'An APNs device token is 64 or more hex characters.')
    .transform((token) => token.toLowerCase());

/**
 * The iPhone app bundle ids Server pushes to. The bundle id becomes the
 * `apns-topic`, so a client can never pick an arbitrary topic.
 */
export const pushBundleIds = ['chat.haus.ios'] as const;

export const pushRegisterDeviceInputSchema = z
    .object({
        /** The app's bundle id; it is the `apns-topic` of every push to this device. */
        bundleId: z.enum(pushBundleIds),
        environment: z.enum(pushEnvironments),
        token: pushDeviceTokenSchema,
    })
    .strict();

export const pushUnregisterDeviceInputSchema = z.object({ token: pushDeviceTokenSchema }).strict();

export const pushDeviceResultSchema = z.object({ ok: z.literal(true) }).strict();

/** Longest `aps.alert.body`, in characters. */
export const pushAlertBodyMaxLength = 180;

/**
 * The JSON body of one iPhone push. `aps.thread-id` groups a conversation's
 * pushes; the custom keys route a tap. `threadAnchorMessageId` is non-null
 * when the message is in a Thread, whose Chat is then `chatId`.
 */
export const pushNotificationPayloadSchema = z
    .object({
        aps: z
            .object({
                alert: z
                    .object({
                        body: z.string().max(pushAlertBodyMaxLength),
                        title: z.string().min(1),
                    })
                    .strict(),
                /** The human's Needs you row count across every Server. */
                badge: z.number().int().nonnegative().optional(),
                sound: z.literal('default'),
                'thread-id': idSchema,
            })
            .strict(),
        chatId: idSchema,
        conversationChatId: idSchema,
        messageId: idSchema,
        serverId: idSchema,
        threadAnchorMessageId: idSchema.nullable(),
    })
    .strict();

export type PushRegisterDeviceInput = z.infer<typeof pushRegisterDeviceInputSchema>;
export type PushUnregisterDeviceInput = z.infer<typeof pushUnregisterDeviceInputSchema>;
export type PushDeviceResult = z.infer<typeof pushDeviceResultSchema>;
export type PushNotificationPayload = z.infer<typeof pushNotificationPayloadSchema>;

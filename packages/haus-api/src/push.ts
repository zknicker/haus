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

/** Longest sender name in a push, in characters; Server cuts longer names with an ellipsis. */
export const pushNotificationSenderNameMaxLength = 80;

/**
 * Who wrote the pushed message, for the iPhone Communication Notification.
 * `avatarUrl` is absolute (avatar routes are public by opaque id) and null
 * when the sender has no avatar.
 */
export const pushNotificationSenderSchema = z
    .object({
        avatarUrl: z
            .string()
            .url()
            .regex(/^https?:\/\//u)
            .nullable(),
        id: idSchema,
        kind: z.enum(['agent', 'human']),
        name: z.string().min(1).max(pushNotificationSenderNameMaxLength),
    })
    .strict();

/** Where the pushed message lives: a Channel (named without `#`) or a DM (no name). */
export const pushNotificationConversationSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('channel'), name: z.string().min(1) }).strict(),
    z.object({ kind: z.literal('dm'), name: z.null() }).strict(),
]);

/**
 * The JSON body of one iPhone push. `aps.thread-id` groups a conversation's
 * pushes; the custom keys route a tap. `aps.mutable-content` lets the
 * Notification Service extension turn the alert into a Communication
 * Notification from `sender` and `conversation`; the plain alert is the
 * fallback when it cannot. `threadAnchorMessageId` is non-null
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
                'mutable-content': z.literal(1),
                sound: z.literal('default'),
                'thread-id': idSchema,
            })
            .strict(),
        chatId: idSchema,
        conversation: pushNotificationConversationSchema,
        conversationChatId: idSchema,
        messageId: idSchema,
        sender: pushNotificationSenderSchema,
        serverId: idSchema,
        threadAnchorMessageId: idSchema.nullable(),
    })
    .strict();

export type PushRegisterDeviceInput = z.infer<typeof pushRegisterDeviceInputSchema>;
export type PushUnregisterDeviceInput = z.infer<typeof pushUnregisterDeviceInputSchema>;
export type PushDeviceResult = z.infer<typeof pushDeviceResultSchema>;
export type PushNotificationSender = z.infer<typeof pushNotificationSenderSchema>;
export type PushNotificationConversation = z.infer<typeof pushNotificationConversationSchema>;
export type PushNotificationPayload = z.infer<typeof pushNotificationPayloadSchema>;

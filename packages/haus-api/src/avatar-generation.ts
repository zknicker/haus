import * as z from 'zod';
import { avatarMaxBytes, avatarMediaTypeSchema, avatarPixelSize } from './avatar.ts';

const idSchema = z.string().trim().min(1);

/** The one image model Haus uses for transient avatar generation. */
export const avatarGenerationModel = 'gpt-image-2' as const;

/** Generation returns one PNG that the ordinary avatar contract can serve. */
export const avatarGenerationOutputFormat = 'png' as const;

/** Concepts are deliberately short so the operation stays one clear brief. */
export const avatarGenerationConceptMaxLength = 280;

const avatarGenerationBase64MaxLength = Math.ceil((avatarMaxBytes * 4) / 3) + 8;

export const avatarGenerationRequestSchema = z
    .object({
        concept: z.string().trim().min(1).max(avatarGenerationConceptMaxLength),
    })
    .strict();

export type AvatarGenerationRequest = z.infer<typeof avatarGenerationRequestSchema>;

/** Human App generation targets one existing Agent without mutating it. */
export const agentAvatarGenerationInputSchema = avatarGenerationRequestSchema
    .extend({ agentId: idSchema, serverId: idSchema })
    .strict();

export type AgentAvatarGenerationInput = z.infer<typeof agentAvatarGenerationInputSchema>;

export const generatedAvatarSchema = z
    .object({
        bytesBase64: z
            .string()
            .min(1)
            .max(avatarGenerationBase64MaxLength)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/u, 'Generated avatar bytes must be base64.'),
        byteSize: z.number().int().positive().max(avatarMaxBytes),
        height: z.literal(avatarPixelSize),
        mediaType: avatarMediaTypeSchema,
        width: z.literal(avatarPixelSize),
    })
    .strict();

export type GeneratedAvatar = z.infer<typeof generatedAvatarSchema>;

export const avatarGenerationResponseSchema = z.object({ avatar: generatedAvatarSchema }).strict();

export type AvatarGenerationResponse = z.infer<typeof avatarGenerationResponseSchema>;

/** Release-owned prompt. Only the `{concept}` value may be substituted. */
export const avatarGenerationPromptTemplate =
    'Create a polished retro pixel-art character avatar based on the concept below. Make it a close-up square portrait with bold, highly readable shapes, expressive oversized eyes, crisp stepped pixel edges, and rich but controlled pixel shading. Interpret the concept creatively: invent distinctive clothing, accessories, expressions, silhouettes, or fantasy/adventure details that give the character personality and make it feel like a memorable game character rather than a generic illustration. Keep the composition simple enough to read clearly at small avatar sizes, with the character filling most of the frame. Use a bright, flat single-color background that strongly contrasts with the character. No circular border, badge, text, scenery, or UI elements. Aim for charming, slightly fantastical, high-quality 16-bit/RPG character art with a modern polished finish.\n\n**Concept:** {concept}';

export function buildAvatarGenerationPrompt(concept: string): string {
    return avatarGenerationPromptTemplate.replace('{concept}', concept);
}

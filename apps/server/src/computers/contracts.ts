import { computerBootstrapHelloSchema, computerUpdateProgressSchema } from '@haus/api';
import { z } from 'zod';
import { serverIdSchema, serverSlugSchema } from '../servers/contracts.ts';

export const computerIdSchema = z.string().regex(/^cmp_[A-Za-z0-9_-]{16}$/u);
export const computerCredentialHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const computerAttachmentIdempotencyKeySchema = z.string().regex(/^cak_[A-Za-z0-9_-]{43}$/u);
export const computerLoginDeviceCodeSchema = z.string().min(1).max(256);
export const computerLoginUserCodeSchema = z.string().trim().min(1).max(32);
export const computerLoginOriginSchema = z.string().url();
export const computerLoginSessionIdSchema = z.string().regex(/^cls_[A-Za-z0-9_-]{16}$/u);
export const computerLoginAccessTokenSchema = z.string().regex(/^gcl_at_[A-Za-z0-9_-]{43}$/u);
export const computerLoginRefreshTokenSchema = z.string().regex(/^gcl_rt_[A-Za-z0-9_-]{43}$/u);
export const computerHandshakeSchema = computerBootstrapHelloSchema.omit({
    bootstrapProtocolVersion: true,
    credential: true,
    type: true,
});

export const attachComputerSchema = z
    .object({
        accessToken: computerLoginAccessTokenSchema,
        credentialHash: computerCredentialHashSchema,
        idempotencyKey: computerAttachmentIdempotencyKeySchema,
        slug: serverSlugSchema,
    })
    .strict();
export const validateComputerCredentialSchema = z
    .object({ credentialHash: computerCredentialHashSchema, serverId: serverIdSchema })
    .strict();
export const computerLoginPurposeSchema = z.enum(['login', 'setup']);
export const beginComputerLoginSchema = z
    .object({
        origin: computerLoginOriginSchema,
        purpose: computerLoginPurposeSchema.default('login'),
    })
    .strict();
export const pollComputerLoginSchema = z
    .object({ deviceCode: computerLoginDeviceCodeSchema })
    .strict();
export const completeComputerLoginSchema = z
    .object({ accessToken: z.string().min(1).max(256) })
    .strict();
export const refreshComputerLoginSchema = z
    .object({
        refreshToken: computerLoginRefreshTokenSchema,
        sessionId: computerLoginSessionIdSchema,
    })
    .strict();
export const revokeComputerLoginSchema = refreshComputerLoginSchema;
export const inspectComputerLoginSchema = z
    .object({ accessToken: computerLoginAccessTokenSchema })
    .strict();
export const computerLoginStatusSchema = z
    .object({ userCode: computerLoginUserCodeSchema })
    .strict();
export const approveComputerLoginSchema = computerLoginStatusSchema;
export const denyComputerLoginSchema = computerLoginStatusSchema;

export const computerUpdateInputSchema = z
    .object({
        computerId: computerIdSchema,
        targetVersion: z
            .string()
            .regex(/^\d+\.\d+\.\d+$/u)
            .optional(),
        serverId: serverIdSchema,
    })
    .strict();

export type ComputerHandshake = z.infer<typeof computerHandshakeSchema>;
export const computerProgressSchema = computerUpdateProgressSchema;

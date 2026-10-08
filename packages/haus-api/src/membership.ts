import * as z from 'zod';
import { serverRoleSchema } from './member-authority.ts';
import { participantHandleSchema } from './participant-handle.ts';

/**
 * The Server membership contract: invitations, the member directory, and the
 * management inputs. The Owner/Admin/Member rule those inputs are judged by
 * lives in `member-authority.ts` and is re-exported here, so this module
 * is the one entrypoint both the Server and the App import.
 */
export * from './member-authority.ts';

const idSchema = z.string().trim().min(1);
const timestampSchema = z.iso.datetime({ offset: true });

/**
 * One human's standing on one Server, as the App's member directory shows it.
 * Identity fields are nullable: a human who has never opened the App has a
 * membership but no profile yet, and the App falls back to a derived label.
 */
export const serverMemberSchema = z
    .object({
        avatarUrl: z.string().nullable(),
        description: z.string().nullable(),
        displayName: z.string().nullable(),
        email: z.string().nullable(),
        handle: participantHandleSchema.nullable(),
        joinedAt: timestampSchema,
        role: serverRoleSchema,
        /** The human's IANA zone; null until their App reports one. */
        timezone: z.string().nullable(),
        userId: idSchema,
    })
    .strict();

export type ServerMember = z.infer<typeof serverMemberSchema>;

export const humanDisplayNameSchema = z.string().trim().min(1).max(80);
export const humanDescriptionSchema = z.string().trim().max(500);

/** An IANA zone name the runtime can format in, such as `America/New_York`. */
export const humanTimezoneSchema = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isIanaTimezone, { message: 'Use an IANA timezone, such as America/New_York.' });

/**
 * The App reports the signed-in human's Clerk identity so the Server can seed
 * a profile. It never overwrites a name the human has since chosen.
 */
export const syncHumanIdentityInputSchema = z
    .object({
        email: z.string().trim().max(320).nullable(),
        name: z.string().trim().max(80).nullable(),
        serverId: idSchema,
        /**
         * The device zone. It fills only a blank, so a zone the human chose in
         * Settings survives every later sign-in. Optional because the iPhone App
         * does not report one yet.
         */
        timezone: humanTimezoneSchema.optional(),
    })
    .strict();

export type SyncHumanIdentityInput = z.infer<typeof syncHumanIdentityInputSchema>;

/** A human edits only their own profile; the Server judges that from the caller. */
export const updateHumanProfileInputSchema = z
    .object({
        description: humanDescriptionSchema.nullable(),
        displayName: humanDisplayNameSchema,
        handle: participantHandleSchema.optional(),
        serverId: idSchema,
    })
    .strict();

export type UpdateHumanProfileInput = z.infer<typeof updateHumanProfileInputSchema>;

/** A human sets their own timezone; the Server judges that from the caller. */
export const setHumanTimezoneInputSchema = z
    .object({ serverId: idSchema, timezone: humanTimezoneSchema })
    .strict();

export type SetHumanTimezoneInput = z.infer<typeof setHumanTimezoneInputSchema>;

/**
 * The directory carries the viewer's own identity and role, so the App renders
 * affordances from one server-derived source instead of stitching queries.
 */
export const serverMemberDirectorySchema = z
    .object({
        members: z.array(serverMemberSchema),
        viewerRole: serverRoleSchema,
        viewerUserId: idSchema,
    })
    .strict();

export type ServerMemberDirectory = z.infer<typeof serverMemberDirectorySchema>;

export const listServerMembersInputSchema = z.object({ serverId: idSchema }).strict();

export const getServerMemberInputSchema = z
    .object({ serverId: idSchema, userId: idSchema })
    .strict();

export const changeServerMemberRoleInputSchema = z
    .object({
        confirmation: z.string().optional(),
        role: serverRoleSchema,
        serverId: idSchema,
        userId: idSchema,
    })
    .strict();

export const removeServerMemberInputSchema = z
    .object({
        confirmation: z.string(),
        serverId: idSchema,
        userId: idSchema,
    })
    .strict();

export const leaveServerInputSchema = z
    .object({ confirmation: z.string(), serverId: idSchema })
    .strict();

export const removedServerMemberSchema = z
    .object({ serverId: idSchema, userId: idSchema })
    .strict();

/**
 * An invitation address is compared to a verified Clerk email by exact match
 * after trimming and lowercasing. Haus deliberately does not canonicalize
 * provider-specific forms such as plus tags or dots: Clerk verifies the literal
 * address, so folding them would let one address consume another's invitation.
 */
export const serverInvitationEmailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email());

/** Live invitations are `pending`; the rest are terminal display states. */
export const serverInvitationStatusSchema = z.enum(['accepted', 'expired', 'pending', 'revoked']);

export type ServerInvitationStatus = z.infer<typeof serverInvitationStatusSchema>;

/** What Owners and Admins may see. The token and its hash are never included. */
export const serverInvitationSchema = z
    .object({
        createdAt: timestampSchema,
        email: z.string().min(1),
        expiresAt: timestampSchema,
        id: idSchema,
        invitedByUserId: idSchema,
        status: serverInvitationStatusSchema,
    })
    .strict();

export type ServerInvitation = z.infer<typeof serverInvitationSchema>;

export const createServerInvitationInputSchema = z
    .object({ email: serverInvitationEmailSchema, serverId: idSchema })
    .strict();

/**
 * The one and only disclosure of the raw token. Haus stores only its SHA-256
 * hash, so an issuer who loses this response must revoke and reissue.
 */
export const createdServerInvitationSchema = z
    .object({ invitation: serverInvitationSchema, token: z.string().min(1) })
    .strict();

export const listServerInvitationsInputSchema = z.object({ serverId: idSchema }).strict();

export const serverInvitationListSchema = z.array(serverInvitationSchema);

export const revokeServerInvitationInputSchema = z
    .object({ invitationId: idSchema, serverId: idSchema })
    .strict();

export const serverInvitationTokenInputSchema = z
    .object({ token: z.string().trim().min(1).max(200) })
    .strict();

/**
 * What an invited human sees before accepting. The bound address is absent on
 * purpose: a token holder must not learn whose invitation they are looking at.
 */
export const serverInvitationPreviewSchema = z
    .object({
        emailMatches: z.boolean(),
        serverDisplayName: z.string().min(1),
        serverSlug: z.string().min(1),
    })
    .strict();

export const acceptedServerInvitationSchema = z
    .object({ serverId: idSchema, serverSlug: z.string().min(1) })
    .strict();

function isIanaTimezone(value: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
        return true;
    } catch {
        return false;
    }
}

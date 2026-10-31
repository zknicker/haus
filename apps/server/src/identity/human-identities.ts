import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { usersTable, userVerifiedEmailsTable } from '../postgres/schema.ts';
import type { CloudflareAdmission } from './cloudflare-access.ts';

export class HumanIdentityNotLinkedError extends Error {
    constructor() {
        super('This Cloudflare identity is not linked to a Haus user.');
        this.name = 'HumanIdentityNotLinkedError';
    }
}

export class HumanIdentityEmailMismatchError extends Error {
    constructor() {
        super('This Cloudflare identity does not have a trusted verified email for Haus.');
        this.name = 'HumanIdentityEmailMismatchError';
    }
}

export async function resolveCloudflareHuman(
    db: Pick<HausDatabase, 'select' | 'update'>,
    admission: CloudflareAdmission
) {
    const [user] = await db
        .select({
            avatarId: usersTable.avatarId,
            displayName: usersTable.displayName,
            email: usersTable.email,
            id: usersTable.id,
        })
        .from(usersTable)
        .where(eq(usersTable.authSubject, admission.identitySubject))
        .limit(1);

    if (!user) {
        throw new HumanIdentityNotLinkedError();
    }

    const [verifiedEmail] = await db
        .select({ email: userVerifiedEmailsTable.email })
        .from(userVerifiedEmailsTable)
        .where(
            and(
                eq(userVerifiedEmailsTable.userId, user.id),
                eq(userVerifiedEmailsTable.email, admission.email)
            )
        )
        .limit(1);

    if (!verifiedEmail) {
        throw new HumanIdentityEmailMismatchError();
    }

    if (user.email !== admission.email) {
        await db
            .update(usersTable)
            .set({ email: admission.email })
            .where(eq(usersTable.id, user.id));
    }

    return { ...user, email: admission.email };
}

export async function listVerifiedEmails(db: Pick<HausDatabase, 'select'>, userId: string) {
    const rows = await db
        .select({ email: userVerifiedEmailsTable.email })
        .from(userVerifiedEmailsTable)
        .where(eq(userVerifiedEmailsTable.userId, userId));
    return rows.map(({ email }) => email);
}

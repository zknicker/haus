import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { usersTable, userVerifiedEmailsTable } from '../postgres/schema.ts';

export const developmentAuthFixture = {
    displayName: 'Zach',
    email: 'zknicker@gmail.com',
    identitySubject: 'dev:haus:owner',
    userId: 'usr_dev_haus_owner',
} as const;

/** Creates the one local development human on an empty database; never links by email. */
export async function ensureDevelopmentAuthUser(db: HausDatabase) {
    const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.authSubject, developmentAuthFixture.identitySubject))
        .limit(1);

    if (!existing) {
        const [anyUser] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
        if (anyUser) {
            throw new Error(
                'Development auth identity is not imported. Stage the exact local identity before running the Server migration.'
            );
        }
        await db.insert(usersTable).values({
            authSubject: developmentAuthFixture.identitySubject,
            displayName: developmentAuthFixture.displayName,
            email: developmentAuthFixture.email,
            id: developmentAuthFixture.userId,
        });
    }

    const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.authSubject, developmentAuthFixture.identitySubject))
        .limit(1);
    if (!user) {
        throw new Error('Development auth identity could not be resolved.');
    }

    await db
        .insert(userVerifiedEmailsTable)
        .values({ email: developmentAuthFixture.email, userId: user.id })
        .onConflictDoNothing({ target: userVerifiedEmailsTable.email });
    const [verifiedEmail] = await db
        .select({ userId: userVerifiedEmailsTable.userId })
        .from(userVerifiedEmailsTable)
        .where(
            and(
                eq(userVerifiedEmailsTable.email, developmentAuthFixture.email),
                eq(userVerifiedEmailsTable.userId, user.id)
            )
        )
        .limit(1);
    if (!verifiedEmail) {
        throw new Error('Development auth email belongs to another Haus user.');
    }

    return { identitySubject: developmentAuthFixture.identitySubject, userId: user.id };
}

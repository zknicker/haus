import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { usersTable } from '../postgres/schema.ts';

export interface HausUser {
    id: string;
}

type UserReader = Pick<HausDatabase, 'select'>;

/** Finds the canonical Haus User already bound to an authenticated session. */
export async function findUserById(db: UserReader, userId: string): Promise<HausUser | null> {
    const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

    return user ?? null;
}

import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { avatarsTable } from './avatars.ts';

/**
 * Haus owns the human identity. `clerk_user_id` is only a unique external
 * reference to the authenticating Clerk user; Clerk Organizations and Clerk
 * roles never appear here because they carry no Haus authority.
 */
export const usersTable = pgTable(
    'users',
    {
        avatarId: text('avatar_id').references(() => avatarsTable.id, { onDelete: 'set null' }),
        clerkUserId: text('clerk_user_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        description: text('description'),
        // Seeded from the caller's Clerk identity on first sign-in, then owned
        // by the human. Null until they have opened the App.
        displayName: text('display_name'),
        email: text('email'),
        id: text('id').primaryKey(),
        // The human's IANA zone. The App captures the device zone when unset,
        // and the human can change it in Settings. Agents read it to resolve
        // calendar reminders; instants stay UTC everywhere else.
        timezone: text('timezone'),
    },
    (table) => [uniqueIndex('users_clerk_user_id_key').on(table.clerkUserId)]
);

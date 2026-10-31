import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { avatarsTable } from './avatars.ts';

/** Haus owns the human identity; this subject is only an external lookup key. */
export const usersTable = pgTable(
    'users',
    {
        avatarId: text('avatar_id').references(() => avatarsTable.id, { onDelete: 'set null' }),
        authSubject: text('auth_subject').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        description: text('description'),
        // Seeded from the Cloudflare identity on sign-in, then owned by the
        // human. Null until they have opened the App.
        displayName: text('display_name'),
        email: text('email'),
        id: text('id').primaryKey(),
        // The human's IANA zone. The App captures the device zone when unset,
        // and the human can change it in Settings. Agents read it to resolve
        // calendar reminders; instants stay UTC everywhere else.
        timezone: text('timezone'),
    },
    (table) => [uniqueIndex('users_auth_subject_key').on(table.authSubject)]
);

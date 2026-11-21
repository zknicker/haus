import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const bootStepsTable = pgTable('boot_steps', {
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    name: text('name').primaryKey(),
});

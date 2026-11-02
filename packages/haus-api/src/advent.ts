import * as z from 'zod';

/**
 * The Christmas advent calendar, "Your year in Haus": one door a day from
 * Dec 1 to Dec 24, each revealing one fact about the member's year in this
 * Server. Dec 24 opens the recap. The Server counts; the copy is the
 * innkeeper's. Facts are counts and names only, never message content.
 */

/** The last door; Dec 25 and later show every door open. */
export const adventDoorCount = 24;

/**
 * One fact per door, in door order (Dec 1 is `messages-sent`). The App maps
 * each fact to its painted ornament; the Server picks the counts and copy.
 */
export const adventFacts = [
    // Messages the member sent this year.
    'messages-sent',
    // The channel where the member posted most.
    'loudest-channel',
    // The local hour of day the member sent most messages.
    'busiest-hour',
    // The chat with the most distinct participants the member joined.
    'full-house',
    // The member's earliest local send time on a typical morning.
    'early-bird',
    // Agents the member talked with this year.
    'agents-at-table',
    // The Agent the member thanked most in messages addressed to it.
    'most-thanked-agent',
    // Files the member shared.
    'files-shared',
    // Messages the member sent between midnight and 5am local.
    'night-owl',
    // The DM the member wrote in most.
    'closest-dm',
    // The longest thread the member took part in, by replies.
    'longest-thread',
    // Tokens the member's Agents used this year.
    'tokens-used',
    // The member's fastest reply to another participant.
    'quickest-reply',
    // The local calendar date with the most member messages.
    'busiest-day',
    // Tasks closed that the member created or that were assigned to them.
    'tasks-closed',
    // Channels the member created.
    'new-channels',
    // The month the member sent fewest messages.
    'quiet-month',
    // Threads the member started that got a reply.
    'threads-resolved',
    // The reaction the member used most.
    'favorite-reaction',
    // The Agent with the most turns for the member.
    'hardest-worker',
    // How often the member was mentioned.
    'in-demand',
    // The member's longest run of consecutive local days with a message sent.
    'longest-streak',
    // Share of the member's messages sent on weekends.
    'weekends-off',
    // Dec 24: the whole year.
    'recap',
] as const;
export const adventFactSchema = z.enum(adventFacts);
export type AdventFact = z.infer<typeof adventFactSchema>;

/** One run of the innkeeper's line; `strong` runs carry the numbers and names. */
export const adventLineRunSchema = z
    .object({ strong: z.boolean(), text: z.string().min(1) })
    .strict();
export type AdventLineRun = z.infer<typeof adventLineRunSchema>;
export const adventLineSchema = z.array(adventLineRunSchema).min(1);

const adventDoorSchema = z.number().int().min(1).max(adventDoorCount);

export const adventFactEntrySchema = z
    .object({
        day: adventDoorSchema,
        fact: adventFactSchema.exclude(['recap']),
        kind: z.literal('fact'),
        line: adventLineSchema,
        title: z.string().min(1),
    })
    .strict();

export const adventRecapEntrySchema = z
    .object({
        closing: adventLineSchema,
        day: z.literal(adventDoorCount),
        fact: z.literal('recap'),
        kind: z.literal('recap'),
        stats: z
            .array(z.object({ label: z.string().min(1), value: z.string().min(1) }).strict())
            .min(1)
            .max(8),
        title: z.string().min(1),
    })
    .strict();

export const adventEntrySchema = z.discriminatedUnion('kind', [
    adventFactEntrySchema,
    adventRecapEntrySchema,
]);
export type AdventEntry = z.infer<typeof adventEntrySchema>;

/**
 * `advent.calendar`: the doors open so far. `throughDay` is the member's
 * local day of December (25 opens every door); `timeZone` is the App's IANA
 * zone, used for hours, days and the year's bounds. The Server refuses a
 * `throughDay` past the latest December day anywhere on Earth.
 */
export const adventCalendarInputSchema = z
    .object({
        serverId: z.string().trim().min(1),
        throughDay: z
            .number()
            .int()
            .min(1)
            .max(adventDoorCount + 1),
        timeZone: z.string().trim().min(1),
        year: z.number().int().min(2025).max(2100),
    })
    .strict();
export type AdventCalendarInput = z.infer<typeof adventCalendarInputSchema>;

export const adventCalendarSchema = z
    .object({
        /** Entries for days 1 through min(throughDay, 24), in day order. */
        entries: z.array(adventEntrySchema).max(adventDoorCount),
        year: z.number().int(),
    })
    .strict();
export type AdventCalendar = z.infer<typeof adventCalendarSchema>;

import {
    type AdventCalendar,
    type AdventCalendarInput,
    type AdventEntry,
    adventDoorCount,
    adventFacts,
} from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { composeFactEntry, composeRecapEntry } from './copy/compose-entry.ts';
import { variantSeed } from './copy/line.ts';
import type { AdventCountedFact } from './fact-stats.ts';
import { openDoors, requireIanaTimeZone } from './season.ts';
import { type AdventStats, readAdventStats } from './stats/fact-readers.ts';

/** The doors the Dec 24 recap summarizes. */
const recapFacts = [
    'agents-at-table',
    'busiest-hour',
    'loudest-channel',
    'messages-sent',
    'most-thanked-agent',
    'tasks-closed',
    'tokens-used',
] as const satisfies readonly AdventCountedFact[];

export interface AdventCalendarOptions {
    now?: Date;
    /** Skip the date gate. Only a development Server may set it. */
    preview?: boolean;
}

/**
 * "Your year in Haus": the member's open doors for one calendar year in one
 * Server. Each door is one counted fact in the innkeeper's voice; only the
 * requested doors are read.
 */
export async function readAdventCalendar(
    db: Pick<HausDatabase, 'execute' | 'select'>,
    member: HausUser | null,
    input: AdventCalendarInput,
    options: AdventCalendarOptions = {}
): Promise<AdventCalendar> {
    const timeZone = requireIanaTimeZone(input.timeZone);
    const days = openDoors(input, options.now ?? new Date(), {
        preview: options.preview ?? false,
    });
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        throw new Error('Authenticated Server membership requires a Haus User.');
    }

    const recap = days.includes(adventDoorCount);
    const facts = days.filter((day) => day < adventDoorCount).map(factForDay);
    const stats = await readAdventStats(
        db,
        { serverId: input.serverId, timeZone, userId: member.id, year: input.year },
        recap ? [...facts, ...recapFacts] : facts,
        { recap }
    );
    const entries: AdventEntry[] = days.map((day) => {
        const seed = variantSeed(member.id, input.year, day);
        if (day === adventDoorCount) {
            return recapEntry(stats, seed);
        }
        const fact = factForDay(day);
        return composeFactEntry({ day, fact, seed, stat: stats.stat(fact) });
    });
    return { entries, year: input.year };
}

function factForDay(day: number): AdventCountedFact {
    return adventFacts[day - 1] as AdventCountedFact;
}

function recapEntry(stats: AdventStats, seed: string) {
    if (!stats.recapCounts) {
        throw new Error('The recap needs its room counts.');
    }
    return composeRecapEntry(
        {
            agents: stats.stat('agents-at-table'),
            busiestHour: stats.stat('busiest-hour'),
            counts: stats.recapCounts,
            loudest: stats.stat('loudest-channel'),
            messages: stats.stat('messages-sent'),
            tasks: stats.stat('tasks-closed'),
            thanked: stats.stat('most-thanked-agent'),
            tokens: stats.stat('tokens-used'),
        },
        seed
    );
}

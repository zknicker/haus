/**
 * Time chips: a clock time written in prose with an explicit timezone, such as
 * "3 PM ET", "15:00 UTC", "tomorrow at 9am Pacific", or "10–11 AM ET". The
 * stored text never changes; each client finds these spans when it renders a
 * message and shows the instant in the viewer's own zone.
 *
 * The rule (iOS mirrors it exactly):
 * - A clock is `H[:MM[:SS]] am|pm` (1–12, `a.m.` and no space allowed) or a
 *   24-hour `HH:MM[:SS]` (0–23). A bare hour without am/pm never matches.
 * - A zone must follow the clock: UTC, GMT, ET/EST/EDT/Eastern, CT/CST/CDT/Central,
 *   MT/MST/MDT/Mountain, PT/PST/PDT/Pacific, optionally followed by "Time", or an
 *   IANA name such as `America/New_York` that the platform knows by exactly that
 *   spelling. Every US abbreviation means that region's wall clock (so "CST" is
 *   US Central, and "3 PM PST" in summer is 3 PM Pacific daylight time). The
 *   zone may sit in parentheses, optionally after "your time": `12 PM (ET)`.
 *   Punctuation may follow the zone, but not a colon and a digit.
 * - A range `<clock> - <clock> <zone>` (`-`, `–`, `—`, or `to`) is one chip; a
 *   start without am/pm borrows the end's, flipping it when that would put the
 *   start after the end. An end before the start lands on the next day.
 * - The day comes from a date right before the clock (`today`, `tonight`,
 *   `tomorrow`, `yesterday`, a weekday, `next Friday`, `Oct 10`, `Oct 10, 2026`,
 *   `Fri, Oct 10`, or `2026-10-10`, joined by a space, a comma, or "at"), else
 *   from one right after the zone (`tomorrow`, `on Friday`, `next Tuesday, Oct 13`),
 *   else the message's sent day. Relative words resolve from the sent time in
 *   the stated zone; a weekday is the next one on or after the sent day, and
 *   `next` makes it strictly after; a month-day without a year takes the sent
 *   year unless that is over 182 days before the sent day.
 * - Renderers skip code spans, code blocks, and blockquotes.
 */
export interface TimeChipMatch {
    /** UTF-16 offsets into the scanned text. */
    end: number;
    /** ISO instant of the range end, when the text is a range. */
    endsAt?: string;
    start: number;
    /** ISO instant the text names. */
    startsAt: string;
    text: string;
}

export function findTimeChips(text: string, sentAt: Date): TimeChipMatch[] {
    const matches: TimeChipMatch[] = [];
    for (const match of text.matchAll(timeChipPattern)) {
        const resolved = resolveMatch(match.groups ?? {}, sentAt);
        if (resolved) {
            matches.push({
                end: match.index + match[0].length,
                start: match.index,
                text: match[0],
                ...resolved,
            });
        }
    }
    return matches;
}

const zones: Record<string, string> = {
    C: 'America/Chicago',
    Central: 'America/Chicago',
    E: 'America/New_York',
    Eastern: 'America/New_York',
    GMT: 'UTC',
    M: 'America/Denver',
    Mountain: 'America/Denver',
    P: 'America/Los_Angeles',
    Pacific: 'America/Los_Angeles',
    UTC: 'UTC',
};

const meridiem = String.raw`[AaPp]\.?[Mm]\.?`;
const clock = (n: number) =>
    String.raw`(?<h${n}>\d{1,2})(?::(?<m${n}>\d{2})(?::(?<s${n}>\d{2}))?)?\s?(?<ap${n}>${meridiem})?`;
const dayWord = '[Tt]oday|[Tt]onight|[Tt]omorrow|[Yy]esterday';
const weekday =
    'Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?';
const month =
    'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const date = (p: string) =>
    String.raw`(?<${p}Day>${dayWord})|(?:(?:[Nn]ext\s+)?(?:${weekday})\.?,?\s+)?(?:(?<${p}Mon>${month})\.?\s+(?<${p}Dom>\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(?<${p}Year>\d{4}))?|(?<${p}Iso>\d{4}-\d{2}-\d{2}))|(?:(?<${p}Next>[Nn]ext)\s+)?(?<${p}Wd>${weekday})\.?`;
const ianaSegment = '[A-Z][A-Za-z_]*(?:-[a-z]+-[A-Z][A-Za-z_]*)?';
const zone = (p: string) =>
    String.raw`(?<${p}iana>(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)(?:/${ianaSegment})+)|(?<${p}zone>UTC|GMT|(?<${p}abbr>[ECMP])[SD]?T|Eastern|Central|Mountain|Pacific)(?:\s+[Tt]ime)?`;
const statedZone = String.raw`(?:(?:[Yy]our\s+time\s+)?\((?:${zone('p')})\)|(?:${zone('')}))`;
const timeChipPattern = new RegExp(
    String.raw`(?<![\w:])(?:(?:${date('pre')})(?:,?\s+at\s+|,\s+|\s+))?${clock(1)}(?:\s*(?:[-–—]|to)\s*${clock(2)})?\s+${statedZone}(?:\s+(?:on\s+)?(?:${date('post')}))?(?!\w|:\d)`,
    'gu'
);

const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const dayOffsets: Record<string, number> = { today: 0, tonight: 0, tomorrow: 1, yesterday: -1 };

type Groups = Partial<Record<string, string>>;

function resolveMatch(groups: Groups, sentAt: Date) {
    const timeZone = readZone(groups);
    const end = readClock(groups.h2, groups.m2, groups.s2, groups.ap2);
    const borrowed = groups.ap1 ? undefined : groups.ap2;
    let start = readClock(groups.h1, groups.m1, groups.s1, groups.ap1 ?? borrowed);
    if (!timeZone || start === null || (groups.h2 !== undefined && end === null)) {
        return null;
    }
    if (end !== null && borrowed && start > end) {
        start = (start + 12 * 3600) % 86_400;
    }
    const day = readDay(groups, sentAt, timeZone);
    if (!day) {
        return null;
    }
    const startsAt = new Date(zonedInstant(day, start, timeZone)).toISOString();
    if (end === null) {
        return { startsAt };
    }
    const endDay = end > start ? day : addDays(day, 1);
    return { endsAt: new Date(zonedInstant(endDay, end, timeZone)).toISOString(), startsAt };
}

function readZone(groups: Groups): string | null {
    const iana = groups.iana ?? groups.piana;
    if (iana) {
        return knownZone(iana) ? iana : null;
    }
    return zones[groups.abbr ?? groups.pabbr ?? groups.zone ?? groups.pzone ?? ''] ?? null;
}

/** Whether the platform knows `name` by exactly that spelling. */
function knownZone(name: string) {
    try {
        return (
            new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone === name
        );
    } catch {
        return false;
    }
}

/** Seconds after midnight, or null when the clock is not a full time. */
function readClock(
    hourText?: string,
    minuteText?: string,
    secondText?: string,
    ap?: string
): number | null {
    if (hourText === undefined) {
        return null;
    }
    const hour = Number(hourText);
    const minute = minuteText === undefined ? 0 : Number(minuteText);
    const second = secondText === undefined ? 0 : Number(secondText);
    if (minute > 59 || second > 59) {
        return null;
    }
    if (!ap) {
        return minuteText !== undefined && hour <= 23 ? hour * 3600 + minute * 60 + second : null;
    }
    if (hour < 1 || hour > 12) {
        return null;
    }
    const pm = ap[0]?.toLowerCase() === 'p';
    return ((hour % 12) + (pm ? 12 : 0)) * 3600 + minute * 60 + second;
}

interface CalendarDay {
    day: number;
    month: number;
    year: number;
}

function readDay(groups: Groups, sentAt: Date, timeZone: string): CalendarDay | null {
    const sent = calendarDay(sentAt, timeZone);
    const word = groups.preDay ?? groups.postDay;
    if (word) {
        return addDays(sent, dayOffsets[word.toLowerCase()] ?? 0);
    }
    const iso = groups.preIso ?? groups.postIso;
    if (iso) {
        const [year, monthNumber, day] = iso.split('-').map(Number);
        return validDay({ day: day ?? 0, month: monthNumber ?? 0, year: year ?? 0 });
    }
    const monthName = groups.preMon ?? groups.postMon;
    if (monthName) {
        const named = {
            day: Number(groups.preDom ?? groups.postDom),
            month: months.indexOf(monthName.slice(0, 3).toLowerCase()) + 1,
            year: Number(groups.preYear ?? groups.postYear ?? sent.year),
        };
        const explicitYear = groups.preYear ?? groups.postYear;
        if (!explicitYear && daysFrom(sent, named) < -182) {
            named.year += 1;
        }
        return validDay(named);
    }
    const weekdayName = groups.preWd ?? groups.postWd;
    if (weekdayName) {
        return nextWeekday(sent, weekdayName, Boolean(groups.preNext ?? groups.postNext));
    }
    return sent;
}

/** The named weekday on or after `sent`, or strictly after it for "next". */
function nextWeekday(sent: CalendarDay, name: string, strictlyAfter: boolean) {
    const target = weekdays.indexOf(name.slice(0, 3).toLowerCase());
    const current = new Date(utc(sent)).getUTCDay();
    return addDays(
        sent,
        strictlyAfter ? ((target - current + 6) % 7) + 1 : (target - current + 7) % 7
    );
}

function validDay(day: CalendarDay): CalendarDay | null {
    const normalized = addDays(day, 0);
    return normalized.day === day.day && normalized.month === day.month ? day : null;
}

function addDays(day: CalendarDay, days: number): CalendarDay {
    const date = new Date(utc({ ...day, day: day.day + days }));
    return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

function daysFrom(from: CalendarDay, to: CalendarDay) {
    return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** Epoch milliseconds of a UTC wall time; unlike `Date.UTC`, years 0–99 stay literal. */
function utc({ day, month: monthNumber, year }: CalendarDay, seconds = 0) {
    const date = new Date(0);
    date.setUTCFullYear(year, monthNumber - 1, day);
    date.setUTCHours(0, 0, seconds, 0);
    return date.getTime();
}

function calendarDay(instant: Date, timeZone: string): CalendarDay {
    const parts = zoneParts(instant.getTime(), timeZone);
    return { day: parts.day, month: parts.month, year: parts.year };
}

/** The instant a wall-clock time in `timeZone` names (DST-aware). */
function zonedInstant(day: CalendarDay, seconds: number, timeZone: string): number {
    const wall = utc(day, seconds);
    const firstOffset = zoneOffset(wall, timeZone);
    const guess = wall - firstOffset;
    const secondOffset = zoneOffset(guess, timeZone);
    return secondOffset === firstOffset ? guess : wall - secondOffset;
}

function zoneOffset(instant: number, timeZone: string) {
    const p = zoneParts(instant, timeZone);
    return utc(p, p.hour * 3600 + p.minute * 60 + p.second) - Math.floor(instant / 1000) * 1000;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneParts(instant: number, timeZone: string) {
    let format = formatters.get(timeZone);
    if (!format) {
        format = new Intl.DateTimeFormat('en-US', {
            day: 'numeric',
            era: 'short',
            hour: 'numeric',
            hourCycle: 'h23',
            minute: 'numeric',
            month: 'numeric',
            second: 'numeric',
            timeZone,
            year: 'numeric',
        });
        formatters.set(timeZone, format);
    }
    const parts = Object.fromEntries(
        format.formatToParts(instant).map((part) => [part.type, part.value])
    );
    const year = Number(parts.year);
    return {
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        month: Number(parts.month),
        second: Number(parts.second),
        // Year 0000 is 1 BC.
        year: parts.era?.startsWith('B') ? 1 - year : year,
    };
}

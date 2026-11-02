import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { useColorThemeDefinition } from '../../../hooks/shell/use-color-theme.ts';
import { AdventChip } from '../../advent/advent-chip.tsx';
import { SleighRide } from '../../sleigh-ride/sleigh-ride.tsx';
import { useServerContext } from '../server-context.ts';
import { greetingLine } from './inbox-greeting.ts';
import { todayLabel } from './inbox-today.ts';

/**
 * The page's opening line: who is reading, and what day it is. It is the one
 * place the Inbox addresses the person rather than the work, so it is a line
 * and a date with no card around it.
 *
 * The line is set at the page-title step every settings page opens with
 * (`SettingsPageHeader`: semibold `text-2xl`, tight tracking, the date as
 * `text-sm` body copy under it). The Inbox shares those pages' band and
 * column now, and at `text-lg` the greeting sat in the same slot with the
 * same 30px above it yet read as pushed lower — a smaller face in the same
 * box shows more air. Same step, same read. It takes none of that header's
 * `px-4`, because the Inbox's section titles below it sit on the column's
 * own edge and the greeting leads that same edge.
 *
 * Reserve the greeting line before the directory arrives, so the date and
 * the sections below it keep their position while the name resolves.
 *
 * Under a Christmas theme the header carries two seasonal pieces: the advent
 * calendar's chip after the date (docs/features/advent-calendar.md) and the
 * sleigh ride flying the air above the greeting.
 */
export function InboxHeader() {
    const { server } = useServerContext();
    const members = useMembers(server.id);
    const humans = useHumanDirectory(server.id);
    // The date only has to be right, not live; the minute tick is what keeps a
    // greeting from staying "Good morning" into the afternoon.
    const now = useRelativeNow(60_000);
    const viewerUserId = members.data?.viewerUserId ?? null;
    // A theme's costume is in the words alone; the sidebar's mascot already marks the theme.
    const { greetings } = useColorThemeDefinition();

    return (
        // Positioned for the sleigh ride, which flies the air above the greeting.
        <header className="relative flex flex-col gap-1.5">
            <SleighRide />
            <h1 className="min-h-[1lh] font-semibold text-2xl text-foreground tracking-tight">
                {viewerUserId ? greetingLine(now, humans.name(viewerUserId), greetings) : null}
            </h1>
            {/* The advent chip is the line's own height, so the date line never grows. */}
            <div className="flex h-5 items-center gap-2.5">
                <p className="text-muted text-sm">{todayLabel(now)}</p>
                <AdventChip />
            </div>
        </header>
    );
}

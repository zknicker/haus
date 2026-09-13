import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { useServerContext } from '../server-context.ts';
import { greetingLine, todayLabel } from './inbox-today.ts';

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
 * A greeting needs a name, so nothing renders until the member directory
 * lands. A bare "Good afternoon" addresses nobody, and a date that jumps down
 * a line when the name arrives is worse than a beat of blank.
 */
export function InboxHeader() {
    const { server } = useServerContext();
    const members = useMembers(server.id);
    const humans = useHumanDirectory(server.id);
    // The date only has to be right, not live; the minute tick is what keeps a
    // greeting from staying "Good morning" into the afternoon.
    const now = useRelativeNow(60_000);
    const viewerUserId = members.data?.viewerUserId ?? null;

    if (!viewerUserId) {
        return null;
    }

    return (
        <header className="flex flex-col gap-1.5">
            <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                {greetingLine(now, humans.name(viewerUserId))}
            </h1>
            <p className="text-muted text-sm">{todayLabel(now)}</p>
        </header>
    );
}

import type { CrewArchive, CrewTurn, TaskCrewLifecycle } from '@haus/api';
import type { TimelineNote } from '../servers/chat/timeline-notes.ts';

type CrewEvent =
    | { at: number; kind: 'archived'; taskId: string; title: string }
    | { at: number; kind: CrewTurn['status']; startedAt: number; taskId: string; title: string };

export function crewLifecycleNotes(
    lifecycle: TaskCrewLifecycle,
    issueCodes: ReadonlyMap<string, string>
) {
    const name = (task: Pick<CrewTurn, 'taskId' | 'title'>) =>
        issueCodes.get(task.taskId) ?? shortTitle(task.title);
    const events = [
        ...lifecycle.turns.map((turn) => turnEvent(turn, name(turn))),
        ...lifecycle.archives.map((archive) => archiveEvent(archive, name(archive))),
    ].sort((a, b) => a.at - b.at);
    const notes: TimelineNote[] = [];
    let group: CrewEvent[] = [];
    for (const event of events) {
        const first = group[0];
        if (first && (first.kind !== event.kind || event.at - first.at > crewGroupWindowMs)) {
            notes.push(groupNote(group));
            group = [];
        }
        group.push(event);
    }
    if (group.length > 0) {
        notes.push(groupNote(group));
    }
    return notes;
}

export function formatWorkedFor(ms: number) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const crewGroupWindowMs = 60_000;
const titleLimit = 40;

function groupNote(group: readonly CrewEvent[]) {
    const first = group[0];
    const last = group.at(-1);
    if (!(first && last)) {
        throw new Error('A crew note needs at least one event.');
    }
    const names = joinNames([
        ...new Map(group.map((event) => [event.taskId, event.title])).values(),
    ]);
    return {
        id: `crew-note:${first.kind}:${first.taskId}:${first.at}`,
        text: noteText(first.kind, names, group),
        timestamp: new Date(last.at).toISOString(),
    };
}

function noteText(kind: CrewEvent['kind'], names: string, group: readonly CrewEvent[]) {
    if (kind === 'archived') {
        return `${names} archived`;
    }
    const startedAt = Math.min(
        ...group.map((event) => (event.kind === 'archived' ? event.at : event.startedAt))
    );
    const worked = formatWorkedFor(Math.max(...group.map((event) => event.at)) - startedAt);
    return kind === 'failed'
        ? `${names} failed after ${worked}`
        : `${names} finished, worked for ${worked}`;
}

function turnEvent(turn: CrewTurn, title: string) {
    return {
        at: Date.parse(turn.endedAt),
        kind: turn.status,
        startedAt: Date.parse(turn.startedAt),
        taskId: turn.taskId,
        title,
    } satisfies CrewEvent;
}

function archiveEvent(archive: CrewArchive, title: string) {
    return {
        at: Date.parse(archive.archivedAt),
        kind: 'archived',
        taskId: archive.taskId,
        title,
    } satisfies CrewEvent;
}

function joinNames(names: readonly string[]) {
    if (names.length <= 1) {
        return names[0] ?? '';
    }
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function shortTitle(title: string) {
    return title.length > titleLimit ? `${title.slice(0, titleLimit - 1).trimEnd()}…` : title;
}

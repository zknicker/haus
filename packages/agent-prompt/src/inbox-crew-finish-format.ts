import { type CrewFinish, formatTaskTarget } from '@haus/api';

const finishGuidance =
    "A Task's chat holds what it did and said: `haus message read --target task:<id> --unread` reads what is new there. A waiting Task asked someone in its chat, and their answer wakes it. The person who asked you for the work hears from you, where they asked, when it is done or something needs them; people who talk to a Task in its chat already see its answers there. `haus task send <id>` answers a Task.";

/** One line per crew Task whose turn settled, then the guidance, as the Captain's turn input. */
export function composeCrewFinishInput(finishes: readonly CrewFinish[]) {
    return [
        `${formatCrewFinishesNotice(finishes.length)}:`,
        ...finishes.map(
            (finish) =>
                `[Haus crew ${formatTaskTarget(finish.taskShortId)}${finish.issueCodes.map((code) => ` ${code}`).join('')} ${finish.ending}] ${flattened(finish.title)}`
        ),
        '',
        finishGuidance,
    ].join('\n');
}

export function formatCrewFinishesNotice(total: number) {
    return `${total} crew ${total === 1 ? 'Task' : 'Tasks'} ended a turn`;
}

function flattened(value: string) {
    return value.replaceAll(/\s+/gu, ' ').trim();
}

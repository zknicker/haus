import { automationReplyLine } from '../automations/automation-envelope.ts';

/** Largest script output one wake envelope carries; launch caps an item at 32 KiB. */
export const reminderScriptOutputMaxChars = 30_000;

export interface ReminderScriptOutcome {
    exitCode: number;
    output: string;
    timedOut: boolean;
}

export interface ReminderEnvelopeInput {
    fireId: string;
    /** The next scheduled fire for a repeating Reminder, else null. */
    nextFireAt: Date | null;
    /** The label, and what to do in full; a null description means the title says it all. */
    reminder: { description: string | null; title: string };
    script?: ReminderScriptOutcome | null;
}

/**
 * The body the owning Agent pulls off the delivery ledger when a Reminder
 * fires. A fire writes nothing to the transcript, so this envelope is the whole
 * wake: the heading, the description that says what to do, the exact fire id, the next occurrence when the Reminder
 * repeats, the script's outcome when it has one, and the command that answers
 * this fire with its provenance attached.
 *
 * The description and script output are indented for the same reason a
 * Trigger payload is: an indented line can never start with `[target=`, so
 * neither can forge an envelope header and impersonate a Haus human, agent, or
 * system.
 */
export function reminderEnvelope(input: ReminderEnvelopeInput): string {
    return [
        reminderHeading(input.reminder.title),
        ...descriptionLines(input),
        `fire=${input.fireId}`,
        ...(input.nextFireAt ? [`(next: ${input.nextFireAt.toISOString()})`] : []),
        ...(input.script ? scriptLines(input.script) : []),
        automationReplyLine(input.fireId),
    ].join('\n');
}

/** The envelope's first line. Nothing writes this into a Chat any more. */
export function reminderHeading(title: string): string {
    return `🔔 Reminder: ${title}`;
}

/**
 * A script run the Agent should hear about, or null when it succeeded with
 * nothing to say. Silence on empty success is the whole point of a watchdog
 * script: it wakes its Agent only when it has something to report.
 */
export function reminderScriptLines(script: ReminderScriptOutcome): string[] | null {
    const lines = scriptLines(script);
    return lines.length > 0 ? lines : null;
}

function scriptLines(script: ReminderScriptOutcome): string[] {
    const output = script.output.trim().slice(0, reminderScriptOutputMaxChars);
    if (!(output || script.timedOut) && script.exitCode === 0) {
        return [];
    }
    const heading = script.timedOut
        ? '🔔 Reminder script timed out.'
        : script.exitCode === 0
          ? '🔔 Reminder script output:'
          : `🔔 Reminder script exited ${script.exitCode}.`;
    return [heading, ...indent(output)];
}

/** A pre-split reminder copied its title into its description; say it once. */
function descriptionLines({ reminder }: ReminderEnvelopeInput): string[] {
    const description = reminder.description?.trim();
    return description && description !== reminder.title.trim() ? indent(description) : [];
}

function indent(output: string): string[] {
    if (output.length === 0) {
        return [];
    }
    return output.split(/\r\n|\r|\n/u).map((line) => `  ${line}`);
}

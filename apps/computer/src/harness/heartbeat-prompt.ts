import {
    type AgentHeartbeatAttention,
    type AgentHeartbeatReportAttention,
    heartbeatContextLimit,
} from '@haus/api';
import {
    checkpointInlineLimitBytes,
    latestCheckpoint,
    readCheckpointInline,
} from './heartbeat-checkpoints.ts';

const recipe = 'haus manual get recipes/technique/heartbeat';

/**
 * The whole input of a heartbeat run, composed here so no Chat or inbox frames it: the
 * cutoff, the Server's digest, the latest checkpoint's text, the open leads and reminders,
 * the connection names, and the recipe's every-run steps, so the run starts with what it
 * would otherwise fetch first. The system prompt does not change (specs/heartbeat.md).
 */
export async function composeHeartbeatInput(
    heartbeat: AgentHeartbeatAttention,
    workspaceDir: string
): Promise<string> {
    const label = `${heartbeat.kind} heartbeat`;
    const fetchRecipe = `\`${recipe} --intent "${label}" --reason "Haus started my heartbeat"\``;
    return [
        `[Haus ${label}] Haus started this ${label} for you. ${
            heartbeat.kind === 'nightly'
                ? `Read the full recipe first, its nightly section matters: ${fetchRecipe}.`
                : `The every-run steps are below; fetch the recipe (${fetchRecipe}) only if you need detail.`
        } The checkpoint, leads, reminders, and connections below are current, so do not fetch them again. Post nothing in any chat. A \`haus heartbeat report\` is not a post: send at most one, only when you found something worth reporting; staying quiet is the usual outcome, and a quiet run sends no report.`,
        heartbeat.since
            ? `Cutoff: ${heartbeat.since}. Cover everything since then.`
            : 'No earlier cutoff: this is your first look back.',
        digestSection(heartbeat.digest),
        await checkpointSection(workspaceDir),
        leadsLine(heartbeat.leads),
        remindersLine(heartbeat.reminders),
        connectionsLine(heartbeat.connections),
        everyRunSteps,
        ...(heartbeat.kind === 'nightly'
            ? [
                  'Nightly, also: recipe steps 7–10 (reflect, consolidate memory, follow up dropped promises, write the learned summary only if there are real lessons).',
              ]
            : []),
    ].join('\n\n');
}

const everyRunSteps = [
    'Every run, even a quiet one:',
    '1. Catch up: read each digest conversation with its command; the digest has no bodies.',
    '2. Notice: check the sources your work depends on for what changed since the checkpoint, by calling the connections above with the `execute` tool, then look wider as your role suggests.',
    '3. Follow leads: before researching one, claim it with `haus lead claim --topic "..." [--message-id <id>]` (refused means another Agent holds it, so leave it); record the result with `haus lead done --id <id> --finding "..."`.',
    '4. Decide: report only what is urgent, changes a plan, involves money or a deadline, answers a question, or really changed; never repeat what the checkpoint says you reported.',
    '5. Report or stay quiet: at most one `haus heartbeat report` (body on stdin, findings first: what, why it matters, how sure, next step). Daytime runs never edit MEMORY.md.',
    '6. Checkpoint: write `heartbeat/checkpoints/<YYYY-MM-DD>/<HH-mm>.md` (nightly: `heartbeat/daily/<YYYY-MM-DD>.md`) with the exact report or "quiet" and why, what you checked and could not, open leads, and where to pick up. Do not read back what you wrote.',
].join('\n');

/** The input of a report run: the Agent's own heartbeat report, handed to its main session. */
export function composeHeartbeatReportInput(report: AgentHeartbeatReportAttention): string {
    return [
        `[Haus heartbeat report] Your own heartbeat (run ${report.heartbeatRunId}) reported:`,
        report.text,
        report.heartbeatKind === 'nightly'
            ? 'This came from your nightly heartbeat, so post nothing now: for anything someone should hear, schedule a morning reminder anchored to the message it concerns, or do nothing.'
            : 'You decide whether anyone should hear this: post where it belongs, or do nothing. Between 22:00 and 08:00, schedule a morning reminder instead of posting.',
    ].join('\n\n');
}

function digestSection(digest: AgentHeartbeatAttention['digest']): string {
    if (digest.entries.length === 0) {
        return 'Digest: no conversation you took part in moved since the cutoff.';
    }
    const lines = digest.entries.map((entry) => {
        const speakers = entry.speakers.length > 0 ? entry.speakers.join(', ') : 'nobody';
        return [
            `- ${entry.target} (${entry.kind}) "${entry.title}": ${entry.messageCount} new since seq ${entry.afterSequence}`,
            `read with \`haus message read --target ${entry.target} --after ${entry.afterSequence}\``,
            `speakers ${speakers}`,
            entry.addressed ? 'addressed you' : 'not addressed',
            `last speaker ${entry.lastSpeaker ?? 'unknown'}`,
        ].join('; ');
    });
    if (digest.more > 0) {
        lines.push(`and ${digest.more} more`);
    }
    return ['Digest (busiest and most direct first):', ...lines].join('\n');
}

async function checkpointSection(workspaceDir: string): Promise<string> {
    const checkpoint = await latestCheckpoint(workspaceDir);
    if (!checkpoint) {
        return 'No checkpoint yet: this is your first heartbeat.';
    }
    const inline = await readCheckpointInline(workspaceDir, checkpoint);
    if (!inline) {
        return `Latest checkpoint, read it first: ${checkpoint}`;
    }
    return [
        `Latest checkpoint (${checkpoint}), already read for you${
            inline.truncated
                ? `; cut at ${checkpointInlineLimitBytes} bytes, read the file for the rest`
                : ''
        }:`,
        '--- checkpoint ---',
        inline.text,
        '--- end checkpoint ---',
    ].join('\n');
}

function leadsLine(leads: AgentHeartbeatAttention['leads']): string {
    if (leads.length === 0) {
        return 'Open leads: none.';
    }
    return [
        `Open leads${more(leads.length, '`haus lead list`')}:`,
        ...leads.map((lead) => `- ${lead.id} @${lead.agentHandle}: ${lead.topic}`),
    ].join('\n');
}

function remindersLine(reminders: AgentHeartbeatAttention['reminders']): string {
    if (reminders.length === 0) {
        return 'Your open reminders: none.';
    }
    return [
        `Your open reminders${more(reminders.length, '`haus reminder list`')}:`,
        ...reminders.map(
            (reminder) => `- ${reminder.id} "${reminder.title}" fires ${reminder.fireAt}`
        ),
    ].join('\n');
}

function connectionsLine(connections: AgentHeartbeatAttention['connections']): string {
    return connections.length === 0
        ? 'Connections: none granted.'
        : `Connections you can call with \`execute\`${more(connections.length, '`tools.search`')}: ${connections.join(', ')}. These are connection names, not tool names: \`tools.search\` each one for its exact tool names.`;
}

/** Names the full command when a list hit its inline limit. */
function more(count: number, command: string): string {
    return count >= heartbeatContextLimit ? ` (first ${count}; ${command} shows all)` : '';
}

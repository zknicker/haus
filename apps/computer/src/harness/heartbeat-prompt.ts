import {
    type AgentHeartbeatAttention,
    type AgentHeartbeatReportAttention,
    heartbeatContextLimit,
} from '@haus/api';
import { type HeartbeatSwitch, heartbeatQuietHoursSwitch } from '../heartbeat-dev-switches.ts';
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
        } The checkpoint, leads, reminders, and connections below are current, so do not fetch them again. Post nothing in any chat. A \`haus heartbeat report\` is not a post: send at most one; a quiet run sends no report.`,
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
    '2. Notice: check the sources your work depends on for what is new or still open, by calling the connections above with the `execute` tool, then look wider as your role suggests.',
    '3. Follow leads: a listed lead is held by the Agent named; leave another Agent\'s lead to it. An unanswered question is a lead even if step 2 already found its answer. Before researching or reporting one, claim it with `haus lead claim --topic "..." [--message-id <id>]` (not `haus task claim`); refused means another Agent claimed or finished it, so leave it out of your report. Record the result with `haus lead done --id <id> --finding "..."`.',
    '4. Decide: ask of each open item whether it needs you or someone you work for and is still unhandled, and report it if so. Whether it changed does not matter; a past quiet run decided for itself, so decide again. Stay quiet when nothing does; never resend a finding a past report already carried; a checkpoint whose first line is `Report: quiet` carried nothing.',
    "5. Report or stay quiet: at most one `haus heartbeat report` (body on stdin, findings first: what, why it matters, how sure, next step). An answer to someone's question names the chat and message id it answers: the asker has heard nothing until your main session replies there, so the next step is that reply. Daytime runs never edit MEMORY.md.",
    '6. Checkpoint: write `heartbeat/checkpoints/<YYYY-MM-DD>/<HH-mm>.md` (nightly: `heartbeat/daily/<YYYY-MM-DD>.md`) opening with `Report: quiet` or `Report: <exact report>`, then, for each open item you did not report, why it needs nobody now (unchanged is not a reason), what you checked and could not, open leads, and where to pick up. Do not read back what you wrote.',
].join('\n');

/** The input of a report run: the Agent's own heartbeat report, handed to its main session. */
export function composeHeartbeatReportInput(
    report: AgentHeartbeatReportAttention,
    options: { now?: Date; quietHours?: HeartbeatSwitch } = {}
): string {
    return [
        `[Haus heartbeat report] Your own heartbeat (run ${report.heartbeatRunId}) reported:`,
        report.text,
        report.heartbeatKind === 'nightly'
            ? `This came from your nightly heartbeat, so post nothing now. For anything someone should hear, ${MORNING_REMINDER}. Otherwise do nothing.`
            : daytimeDecision(
                  options.now ?? new Date(),
                  (options.quietHours ?? heartbeatQuietHoursSwitch()) === 'on'
              ),
    ].join('\n\n');
}

/**
 * The morning turn sees the reminder, not this report, so its description carries the
 * instruction; the reminder itself explains nothing to readers, so the post must
 * (Forge, 2026-10-24: a nightly report became a context-free morning post).
 */
const MORNING_REMINDER =
    'schedule a morning reminder anchored to the message it concerns, whose description tells you to open the morning post with a heads-up line: what you noticed and why it matters now. The post must read right on its own, without the reminder';

/** The Computer, not the Agent, works out whether the Computer-local clock is in quiet hours. */
function daytimeDecision(now: Date, quietHoursApply: boolean): string {
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (quietHoursApply && (now.getHours() >= 22 || now.getHours() < 8)) {
        return `It is ${clock} here, inside quiet hours (22:00–08:00): post nothing now. For anything someone should hear, ${MORNING_REMINDER}. Otherwise do nothing.`;
    }
    return `It is ${clock} here. You decide whether anyone should hear this: post where it belongs, or do nothing. Anything you post or do about it unasked opens with a heads-up line: what you noticed and why it matters now. Then act within your standing instructions.`;
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
        : `Connections you can call with \`execute\`${more(connections.length, '`tools.search`')}: ${connections.join(', ')}. These are connection names, not tool names: inside \`execute\` code, \`tools.search\` each one for its exact tool names. Your tool list may show \`execute\` with a prefix, ending in \`__execute\`.`;
}

/** Names the full command when a list hit its inline limit. */
function more(count: number, command: string): string {
    return count >= heartbeatContextLimit ? ` (first ${count}; ${command} shows all)` : '';
}

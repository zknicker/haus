import type { AgentHeartbeatAttention, AgentHeartbeatReportAttention } from '@haus/api';
import { latestCheckpoint } from './heartbeat-checkpoints.ts';

const recipe = 'haus manual get recipes/technique/heartbeat';

/**
 * The whole input of a heartbeat run, composed here so no Chat or inbox frames it: the
 * recipe pointer, the cutoff, the Server's digest, the latest checkpoint, and where to
 * read open reminders and leads. The system prompt does not change (specs/heartbeat.md).
 */
export async function composeHeartbeatInput(
    heartbeat: AgentHeartbeatAttention,
    workspaceDir: string
): Promise<string> {
    const label = `${heartbeat.kind} heartbeat`;
    return [
        `[Haus ${label}] Haus started this ${label} for you. Read the recipe first: \`${recipe} --intent "${label}" --reason "Haus started my heartbeat"\`. Post nothing in any chat.`,
        heartbeat.since
            ? `Cutoff: ${heartbeat.since}. Cover everything since then.`
            : 'No earlier cutoff: this is your first look back.',
        digestSection(heartbeat.digest),
        await checkpointLine(workspaceDir),
        'Open reminders: `haus reminder list`. Open leads: `haus lead list`.',
    ].join('\n\n');
}

/** The input of a report run: the Agent's own heartbeat report, handed to its main session. */
export function composeHeartbeatReportInput(report: AgentHeartbeatReportAttention): string {
    return [
        `[Haus heartbeat report] Your own heartbeat (run ${report.heartbeatRunId}) reported:`,
        report.text,
        'You decide whether anyone should hear this: post where it belongs, or do nothing. Between 22:00 and 08:00, schedule a morning reminder instead of posting.',
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

async function checkpointLine(workspaceDir: string): Promise<string> {
    const checkpoint = await latestCheckpoint(workspaceDir);
    return checkpoint
        ? `Latest checkpoint, read it first: ${checkpoint}`
        : 'No checkpoint yet — this is your first heartbeat.';
}

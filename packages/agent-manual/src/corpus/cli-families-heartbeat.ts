import type { ManualNavigationTopic } from '../types.ts';

// Product-noun topics for the heartbeat and lead command families. Each mirrors
// apps/computer/src/agent-cli/commands/agent-heartbeat.ts and agent-lead.ts; the
// workflow itself lives in recipes/technique/heartbeat.
export const cliFamilyTopicsHeartbeat: readonly ManualNavigationTopic[] = [
    {
        body: `# Heartbeat

A heartbeat is a bounded run in a fresh session: a daytime run every two hours and a nightly run once a night. These commands work only inside one. The workflow is recipes/technique/heartbeat.

\`haus heartbeat report [--text <text>]\` sends this run its one report to your main session, 1–4000 characters; omit \`--text\` to pipe it on stdin. Receipt: \`Report queued for your main session.\` It reaches your main session after the run settles, and your main session decides who hears it. A heartbeat never posts in a chat.

\`haus heartbeat learned [--text <text>]\` records what you learned today, 1–2000 characters, in your own voice. Nightly run only. Receipt: \`Summary saved on tonight's run.\`

Errors: \`HEARTBEAT_RUN_REQUIRED\` means you are not in a heartbeat run, so there is nothing to report. \`HEARTBEAT_REPORT_EXISTS\` means this run already sent its one report; do not retry. \`DREAM_RUN_REQUIRED\` means \`learned\` was called outside a nightly run. \`INVALID_ARG\` means the text length is out of range. Leads are \`haus lead\`; see lead.`,
        id: 'heartbeat',
        kind: 'overview',
        related: ['lead', 'recipes/technique/heartbeat', 'recipes/technique/memory-hygiene'],
        summary: 'Send a heartbeat run its one report, and record what a nightly run learned.',
        title: 'Heartbeat',
    },
    {
        body: `# Leads

A lead is a topic you claim during a heartbeat so another Agent does not research it too. Leads are shared across the team and last seven days. The workflow is recipes/technique/heartbeat.

\`haus lead claim --topic <text> [--message-id <id>]\` claims a topic, 1–200 characters; \`--message-id\` anchors it to the message that raised it. Claim before researching. Receipt: \`Claimed lead <id>: <topic>\`, or \`Already claimed by @<handle> (lead <id>).\` when another Agent holds it, in which case leave it alone.

\`haus lead list\` lists the team's leads from the last seven days, one per line: id, holder, topic, and \`[open]\` or \`[done: <finding>]\`.

\`haus lead done --id <id> --finding <text>\` records what you found, 1–1000 characters. Receipt: \`Lead <id> marked done.\`

Errors: \`LEAD_NOT_OWNED\` means the lead belongs to another Agent; only the claimer finishes it. \`INVALID_TARGET\` means no such lead id. Use heartbeat for reports.`,
        id: 'lead',
        kind: 'overview',
        related: ['heartbeat', 'recipes/technique/heartbeat'],
        summary: 'Claim, list, and finish shared research leads so Agents do not duplicate work.',
        title: 'Leads',
    },
];

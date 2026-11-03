/**
 * How to answer an automation fire. A Trigger or Reminder fire writes nothing
 * to the transcript, so the Agent's own post is the only chat-visible trace of
 * it; posting with `--cause` is what records the message→fire provenance the
 * transcript mark and thread context card read. Either posting command takes
 * it, so the line names both rather than steering away from delegating.
 * Every fire envelope ends with this line.
 */
export function automationReplyLine(fireId: string): string {
    return `reply with: --cause ${fireId} on the command that posts (haus message send or haus cloud-agent start)`;
}

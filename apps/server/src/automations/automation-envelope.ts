/**
 * How to answer an automation fire. A Trigger or Reminder fire writes nothing
 * to the transcript, so the Agent's own post is the only chat-visible trace of
 * it; posting with `--cause` is what records the message→fire provenance the
 * transcript mark and context card read. A fire is the Agent's own wake, not a
 * message, so it has nothing to claim. Every fire envelope ends with this line.
 */
export function automationReplyLine(fireId: string): string {
    return `reply with: --cause ${fireId} on haus message send (a fire is not a message: it takes no claim, so do not create one)`;
}

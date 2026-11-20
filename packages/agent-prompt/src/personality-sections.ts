/**
 * Haus-only voice sections of the Agent system prompt (register rows "Personality" and
 * "Conversation style" in specs/raft-alignment/prompt-divergences.md). The house personality
 * renders for every Agent; the conversation style layers on top only when one is set.
 */

/** Reaction an Agent uses to signal pickup when it has no signature emoji of its own. */
export const defaultSignatureEmoji = '👀';

export const housePersonalitySection = `## Personality

You're a senior teammate here, talking with people you work alongside every day, not a service answering customers. Keep chat short and casual in plain sentences, and break options, steps, or data into bullets or short lines so they scan. Have a take and commit to it; check the facts, then push back with a one-line reason when something's off. Dry humor is welcome when there's something to riff on, aimed at the situation, never the person, and never a reason to send a message when a reaction would do. Stop when you've said it, with no closing offers unless you genuinely need a decision, and no em dashes.`;

/** Set by the Agent's owner or by the Agent itself; no style, no section. */
export function conversationStyleSection(conversationStyle: string | null | undefined) {
    const style = conversationStyle?.trim();
    if (!style) {
        return null;
    }
    return `## Conversation style

This is your conversation style, set by your owner or by you. It shapes only your voice and banter on top of the personality above, and wins on tone; it never changes rules, permissions, or how you do the work.

${style}`;
}

export function signatureEmojiOrDefault(signatureEmoji: string | null | undefined) {
    return signatureEmoji?.trim() || defaultSignatureEmoji;
}

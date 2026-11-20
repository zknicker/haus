import type { UnreadElsewhere } from '@haus/api';
import { formatUnreadElsewhere } from './inbox-format.ts';

export interface TurnSessionFacts {
    readonly isColdStart: boolean;
    /** The resumed conversation ends in a turn Haus interrupted. */
    readonly resumesInterruptedTurn?: boolean;
    readonly sessionGeneration: number;
}

export interface TurnOpening {
    /** The turn's inbox drain, notice, or chatless input. */
    readonly body: string | null;
    /** The Server attached the new Agent's one-time greeting to this run. */
    readonly greets: boolean;
    readonly unreadElsewhere: readonly UnreadElsewhere[];
}

const interruptedTurnLine =
    'Your previous turn was interrupted by Haus (a Stop, a restart, or a stalled-turn timeout), not by anyone in the conversation. A tool call it cancelled may read as declined or rejected by the user; nobody declined it, and its side effects may be partial. Any work that turn left unfinished is offered again here.';

const resetContextLine =
    'Fresh session: your previous conversation context is gone. Your workspace and MEMORY.md are intact; MEMORY.md is your recovery point.';

const firstTurnGreetingLine = [
    'Post one short, natural self-introduction to #haus so the team knows who you are and what you can help with.',
    'Write it in your own voice, one or two sentences. Do NOT paste a fixed template. If a conversation is already going there, read the room and keep it brief.',
    'This is a one-time greeting; after you post it, go back to normal work.',
].join('\n');

/**
 * The input of a sub-agent wake run when no turn of the runtime's own is there to adopt: the
 * report landed while nothing could act on it (its turn already ended, or the Computer
 * restarted and the work was lost). The runtime's own notice is already in the conversation.
 */
export const subagentWakeTurnLine =
    '[Haus sub-agent turn] Haus started this turn because background work you started (a sub-agent or a background command) finished or stopped; its notice is above in your conversation. If you have not reported it yet, report the result where it was asked for, or say it stopped before finishing. Otherwise stop. If new messages arrive meanwhile, handle them normally.';

/**
 * One turn's whole input around its body. The interruption line exists because Claude Code
 * records a cancelled tool call as the user declining it, so without it the Agent tells the
 * requester its work was refused. `Start.` is reserved for a cold session with nothing pending;
 * a later generation's cold start also gets the reset line. The greeting (Raft db5e399's
 * `buildAllChannelAgenticGreetingInstruction`, ADR 0028) shows on every run the Server attached
 * it to, warm or cold, because the Server consumes it with that run.
 */
export function composeTurnContent(session: TurnSessionFacts, opening: TurnOpening) {
    return joined([
        session.resumesInterruptedTurn ? interruptedTurnLine : null,
        openingPrompt(session, opening.body, opening.greets),
        formatUnreadElsewhere(opening.unreadElsewhere),
    ]);
}

function openingPrompt(session: TurnSessionFacts, body: string | null, greets: boolean) {
    const greeting = greets ? firstTurnGreetingLine : null;
    if (!session.isColdStart) {
        return joined([greeting, body]) || 'Resume the interrupted turn.';
    }
    const resetNote = session.sessionGeneration === 1 ? null : resetContextLine;
    const coldNote = joined([resetNote, greeting]);
    if (body) {
        return joined([coldNote, body]);
    }
    return coldNote ? `Start.\n${coldNote}` : 'Start.';
}

function joined(parts: readonly (string | null)[]) {
    return parts.filter(Boolean).join('\n\n');
}

import { expect, test } from 'bun:test';
import { formatInstructionsUpdate } from './instructions-update-format.ts';
import { composeTurnContent } from './turn-opening.ts';

const quiet = { body: null, greets: false, unreadElsewhere: [] };

test('an empty turn opens with Start when cold and resumes when warm', () => {
    expect(composeTurnContent({ isColdStart: true, sessionGeneration: 1 }, quiet)).toBe('Start.');
    expect(composeTurnContent({ isColdStart: false, sessionGeneration: 3 }, quiet)).toBe(
        'Resume the interrupted turn.'
    );
    expect(composeTurnContent({ isColdStart: true, sessionGeneration: 2 }, quiet)).toBe(
        'Start.\nFresh session: your previous conversation context is gone. Your workspace and MEMORY.md are intact; MEMORY.md is your recovery point.'
    );
});

test('an interrupted later-generation greeting turn carries every line in order', () => {
    const content = composeTurnContent(
        { isColdStart: true, resumesInterruptedTurn: true, sessionGeneration: 2 },
        { body: 'BODY', greets: true, unreadElsewhere: [{ count: 2, target: '#ops' }] }
    );

    expect(content).toBe(
        [
            'Your previous turn was interrupted by Haus (a Stop, a restart, or a stalled-turn timeout), not by anyone in the conversation. A tool call it cancelled may read as declined or rejected by the user; nobody declined it, and its side effects may be partial. Any work that turn left unfinished is offered again here.',
            'Fresh session: your previous conversation context is gone. Your workspace and MEMORY.md are intact; MEMORY.md is your recovery point.',
            [
                'Post one short, natural self-introduction to #all so the team knows who you are and what you can help with.',
                'Write it in your own voice, one or two sentences. Do NOT paste a fixed template. If a conversation is already going there, read the room and keep it brief.',
                'This is a one-time greeting; after you post it, go back to normal work.',
            ].join('\n'),
            'BODY',
            'You also have unread messages in other channels:\n- #ops: 2 unread\nRun `haus inbox check` at a natural breakpoint if you choose to inspect those targets; it lists every unread conversation with the command that opens it.',
        ].join('\n\n')
    );
});

test('a warm greeting turn leads with the greeting and skips the reset line', () => {
    const content = composeTurnContent(
        { isColdStart: false, sessionGeneration: 2 },
        { body: 'BODY', greets: true, unreadElsewhere: [] }
    );

    expect(content.startsWith('Post one short, natural self-introduction')).toBe(true);
    expect(content.endsWith('go back to normal work.\n\nBODY')).toBe(true);
    expect(content).not.toContain('Fresh session');
});

test('an instructions update wraps the trimmed instructions', () => {
    expect(formatInstructionsUpdate('PROMPT V2\n\n')).toBe(
        '<haus-instructions-update>\nHaus updated your standing instructions since this session started. The instructions below replace the earlier standing instructions (system or developer prompt) for the rest of this session; where they differ, follow these.\n\nPROMPT V2\n</haus-instructions-update>'
    );
});

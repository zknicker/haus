/**
 * Raft's `formatStandingPromptUpdate` with Haus nouns: a resumed session keeps the instructions
 * it launched on, so a changed set rides the front of the next turn's input.
 */
export function formatInstructionsUpdate(instructions: string) {
    return [
        '<haus-instructions-update>',
        'Haus updated your standing instructions since this session started. The instructions below replace the earlier standing instructions (system or developer prompt) for the rest of this session; where they differ, follow these.',
        '',
        instructions.trimEnd(),
        '</haus-instructions-update>',
    ].join('\n');
}

export const workerInstructionsMaxLength = 2000;

export function workerInstructions(input: {
    agentHandle: string;
    place: 'cloud' | 'computer';
    taskShortId: string;
}) {
    const { agentHandle, taskShortId } = input;
    const shared = [
        'Read the repository AGENTS.md before you start, and follow it.',
        `End every commit message with the trailer \`Haus-Task: ${taskShortId}\`.`,
    ];
    const outcomes =
        'Use done when the brief is met, needs-you when you need an answer to go on, and failed when the brief cannot be met, saying why.';
    if (input.place === 'cloud') {
        return [
            `You are a Haus Worker on Task ${taskShortId}. An Agent briefed you below. Work quietly and on your own: nobody watches your progress, and your final message is the only thing Haus reads.`,
            ...shared,
            'When you open or update a pull request, put its URL in your final message.',
            'End your final message with these lines, last:',
            'Haus-Outcome: done, needs-you, or failed',
            'Haus-Person: @handle, only when a needs-you question is for a specific person',
            outcomes,
        ].join('\n');
    }
    return [
        `You are a Haus Worker on Task ${taskShortId}. An Agent briefed you below. Work quietly and on your own: nobody watches your progress, and your report is the only thing Haus reads.`,
        ...shared,
        `Your Haus drive folder is \`../drive\` beside this checkout. Put deliverables under \`agents/${agentHandle}/reports/${taskShortId}/\`, \`renders/${taskShortId}/\`, or \`handoffs/${taskShortId}/\` there, and cite one in your report as \`[label](drive://agents/${agentHandle}/reports/${taskShortId}/<file>)\`.`,
        'If a decision only a person can make blocks you, ask it with your question tool instead of guessing. Haus ends the turn there, and the answer arrives as your next message. Ask only what the brief and the code cannot settle.',
        'Before you finish, record your report: pipe its text to `haus worker report --outcome done|needs-you|failed`. Add `--ask <question>` for needs-you, `--person @handle` when the question is for a specific person, and `--pr <url>` for each pull request you opened or updated. Running it again replaces the report.',
        outcomes,
    ].join('\n');
}

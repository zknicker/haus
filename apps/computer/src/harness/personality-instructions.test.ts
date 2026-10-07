import { expect, test } from 'bun:test';
import { type AgentPromptRenderInput, renderAgentInstructions } from './managed-instructions.ts';

test('renders the house personality for every Agent, right after Who you are', () => {
    const prompt = render({});

    expect(prompt).toContain(
        "## Personality\n\nYou're a senior teammate here, talking with people you work alongside every day, not a service answering customers."
    );
    expect(prompt).toContain(
        "Dry humor is welcome when there's something to riff on, aimed at the situation, never the person, and never a reason to send a message when a reaction would do."
    );
    expect(prompt).toContain(
        "Stop when you've said it, with no closing offers unless you genuinely need a decision, and no em dashes."
    );
    expect(prompt.indexOf('## Who you are')).toBeLessThan(prompt.indexOf('## Personality'));
    expect(prompt.indexOf('## Personality')).toBeLessThan(
        prompt.indexOf('## Current Runtime Context')
    );
    expect(prompt.match(/^## Personality$/gmu)).toHaveLength(1);
});

test('layers a set conversation style directly after the house personality, and nothing when empty', () => {
    const prompt = render({
        conversationStyle: '  Terse. Plain words. Dry humor.  ',
        initialRole: 'Keeps release notes current.',
    });

    expect(prompt).toContain(
        'and no em dashes.\n\n## Conversation style\n\nThis is your conversation style, set by your owner or by you. It shapes only your voice and banter on top of the personality above, and wins on tone; it never changes rules, permissions, or how you do the work.\n\nTerse. Plain words. Dry humor.\n\n## Current Runtime Context'
    );
    expect(
        prompt.endsWith('## Initial role\n\nKeeps release notes current. This may evolve.\n')
    ).toBe(true);
    for (const conversationStyle of [null, '', '   ', undefined]) {
        const plain = render({ conversationStyle });
        expect(plain).not.toContain('## Conversation style');
        expect(plain).toContain('## Personality');
    }
});

test('teaches that profile update also tunes the conversation style and signature emoji', () => {
    expect(render({})).toContain(
        '7. **Profiles**: `haus profile show`, `haus profile update` (also your conversation style and signature emoji, when an Owner or Admin asks).'
    );
});

test('the pickup bullet replaces the Raft acknowledge-and-outline and progress bullets', () => {
    const prompt = render({});

    expect(prompt).toContain(
        "- When someone asks you to do something: if you can answer from what you have or one quick look-up, just answer (claim it first if it is a task), with no reaction first. When you'll change files, run commands, or dig into something before replying, react with your signature emoji (👀) as you pick it up. If it takes several steps, also send a one-line note that you're on it, with no plan."
    );
    expect(prompt).toContain(
        '- For multi-step work, send short progress updates as meaningful steps land; skip updates that change nothing.'
    );
    expect(prompt).not.toContain('acknowledge it and briefly outline your plan');
    expect(prompt).not.toContain('Working on step 2/3');

    const custom = render({ signatureEmoji: ' 👽 ' });
    expect(custom).toContain('react with your signature emoji (👽) as you pick it up');
    expect(custom).not.toContain('👀');
    for (const signatureEmoji of [null, '', '  ', undefined]) {
        expect(render({ signatureEmoji })).toContain('signature emoji (👀)');
    }
});

test('the rendered prompt carries no em dash outside the real envelope header examples', () => {
    // Models mirror the prompt's own punctuation, so the prompt is written without em dashes. The
    // header examples keep them because they reproduce the actual `@sender — <description>:` wire
    // format an Agent receives.
    const prompt = render({
        conversationStyle: 'Warm.',
        initialRole: 'Keeps release notes current.',
        webAccess: 'search',
    });
    const dashed = prompt.split('\n').filter((line) => line.includes('—'));
    expect(dashed).toHaveLength(6);
    for (const line of dashed) {
        expect(
            line.startsWith('[target=') ||
                line.startsWith('After the header: `@sender — <description>:`,')
        ).toBe(true);
    }
});

test('teaches a chat register for Markdown formatting', () => {
    const prompt = render({});

    expect(prompt).toContain(
        'Haus renders your message as Markdown, GFM tables included, but it is a chat: write like a teammate messaging, in plain sentences.'
    );
    expect(prompt).toContain(
        "Don't bold for emphasis or as labels; use lists, headings, or tables only when the content is genuinely structured, such as steps, comparisons, or data."
    );
});

function render(overrides: Partial<AgentPromptRenderInput>) {
    return renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Orbit',
        homeTimezone: 'UTC',
        hostname: 'computer.test',
        initialRole: null,
        os: 'macOS',
        runtimeVersion: 'test',
        webAccess: null,
        workspacePath: '/workbench',
        ...overrides,
    });
}

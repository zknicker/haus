import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

const prompt = renderAgentInstructions({
    agentId: 'agt_prompt_test',
    agentName: 'Cove',
    homeTimezone: 'UTC',
    hostname: 'computer.test',
    initialRole: null,
    os: 'macOS',
    runtimeVersion: 'test',
    workspacePath: '/workbench',
});

test('one line splits the primitives, and a Task stays distinct from a claim', () => {
    expect(prompt).toContain(
        'Work to do is a Task, a time to wake is a Reminder, and both is a Reminder naming the Task key.'
    );
    expect(prompt).toContain(
        'A Task is queued work on a board and takes no claim; a claim is the lock on a message.'
    );
    // Claims keep their own section and their concurrency-lock rule.
    expect(prompt).toContain('**Claim rule:**');
    expect(prompt).toContain('A failed claim is a concurrency lock');
});

test('the pacing rule is standing; its command shapes ride the assignment input', () => {
    expect(prompt).toContain('Keep one Task active at a time.');
    expect(prompt).toContain('Pick by priority, then age, move its card to an active column');
    expect(prompt).toContain(
        'Moving the card is the status update, so post only when you need a person or have a result worth sharing.'
    );
    expect(prompt).toContain('its receipt names what is still waiting');
    expect(prompt).not.toContain('haus task move <key>');
});

test('the Tasks and Boards families name every verb and point at the Manual', () => {
    expect(prompt).toContain(
        '15. **Tasks**: `haus task list`, `haus task show`, `haus task create`, `haus task move`, `haus task update`, `haus task assign`. Read the `tasks` Manual topic before the first one.'
    );
    expect(prompt).toContain(
        '16. **Boards**: `haus board list`, `haus board create`, `haus board columns`.\n17. **Manual**'
    );
});

test('the section sits with the other work primitives, after the claim sections', () => {
    expect(prompt.indexOf('### Tasks')).toBeGreaterThan(
        prompt.indexOf('### Splitting work into claims')
    );
    expect(prompt.indexOf('### Tasks')).toBeLessThan(prompt.indexOf('## @Mentions'));
});

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

test('a Task blocked on a person goes back to todo, and the queue moves past it', () => {
    expect(prompt).toContain(
        'When a Task is blocked on a person, @mention them with its key where the work lives, move its card back to todo, and take the next Task; leave it until they answer.'
    );
    // The receipt still counts a blocked card, so "until nothing is" would never end.
    expect(prompt).toContain('so keep going until only blocked Tasks remain.');
});

test('splitting for other agents makes Tasks, and claims stay in the conversation', () => {
    expect(prompt).toContain(
        'Subtasks for other agents are Tasks: create them on a board and assign them. Claims stay for work inside a conversation, including a split that stays there.'
    );
    expect(prompt).toContain(
        'When you receive a notification about new claims in a conversation, check the claim list and claim those relevant to your skills; Tasks assigned to you are already yours.'
    );
    // The bullets stay Raft-verbatim.
    expect(prompt).toContain('**Group by phase** if tasks have dependencies.');
    expect(prompt).toContain('**Prefer independent subtasks**');
    expect(prompt).toContain('**Avoid creating sequential chains**');
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
        prompt.indexOf('### Splitting work for parallel execution')
    );
    expect(prompt.indexOf('### Tasks')).toBeLessThan(prompt.indexOf('## @Mentions'));
});

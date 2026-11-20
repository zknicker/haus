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

const tasks = prompt.split('### Tasks\n')[1]?.split('## Working through sub-agents')[0] ?? '';

test('a Task is described by what people see, not by a placement ladder (ADR 0053)', () => {
    expect(tasks).toContain(
        'A Task is how people follow work that takes longer than a reply. While it is open it sits in their sidebar with its state. It has its own page, where you and they talk about that work and where any cloud agents doing it are shown. When it is done, it leaves.'
    );
    expect(tasks).toContain(
        'Create a Task when the work will not be finished in your reply: it needs more steps, more time, or a cloud agent. When your reply is the whole of the work, just reply. A Task does not mark work as yours; your claim already does that.'
    );
    // Claims keep their own section and their concurrency-lock rule.
    expect(prompt).toContain('**Claim rule:**');
    expect(prompt).toContain('A failed claim is a concurrency lock');
});

test('a Task starts from a channel message, with the command shape beside it', () => {
    expect(tasks).toContain(
        'A Task starts from a message in a channel, usually the request itself, or a message you post when there is none: `haus task start --target "#channel" --from <shortid> --title <text>`.'
    );
    expect(tasks).not.toContain('Never from a DM');
});

// ADR 0055 decision 8: work stays in its Project, handed off where everyone sees it.
test('Tasks start in the home Project, and other Projects get an @mention in their channel', () => {
    expect(tasks).toContain(
        'You start Tasks in your home Project; a generalist, whose home is the Haus project, may start one in any Project with `--project <KEY>`. Work that belongs to another Project goes to its home Agents, or to a generalist when it has none, with an @mention in its channel, where everyone sees it.'
    );
});

test('each Task has its own end, and the work goes in the Task', () => {
    expect(prompt).toContain('Work for a Task is posted with `--target task:<KEY-n>`.');
    expect(tasks).toContain(
        "People see each Task under that message with its state and latest line. Each has its own end, so separate pieces of work are separate Tasks, and several can start from one message. Reply with the Task's key; the work itself goes in the Task."
    );
});

test('a Task being worked or waited on stays open, and an after-the-fact check is part of the work', () => {
    expect(tasks).toContain(
        'A Task you are working or waiting on stays `open`, where the people following it can see it. `todo` is work no one has started, and it is not in the sidebar. Set it `done` when the work is finished; a check that has to happen after the work lands is part of the work.'
    );
    for (const gone of [
        'Work Tasks others assign you one at a time',
        'set it back to `todo`',
        'do not repeat the result in the channel',
    ]) {
        expect(tasks).not.toContain(gone);
    }
});

test('no board, column, or card-moving pacing language survives', () => {
    for (const gone of [
        'board',
        'column',
        'Keep one Task active at a time',
        'Moving the card',
        'no pickup note',
        'Work to do is a Task, a time to wake is a Reminder',
    ]) {
        expect(prompt).not.toContain(gone);
    }
});

test('splitting for other agents starts Tasks from one message, and claims stay in the conversation', () => {
    expect(prompt).toContain(
        'Subtasks for other agents are Tasks: post one message that lists them, start a Task from it for each, and assign it. Claims stay for work inside a conversation, including a split that stays there.'
    );
    expect(prompt).toContain(
        'When you receive a notification about new claims in a conversation, check the claim list and claim those relevant to your skills; Tasks assigned to you are already yours.'
    );
    // The bullets stay Raft-verbatim.
    expect(prompt).toContain('**Group by phase** if tasks have dependencies.');
    expect(prompt).toContain('**Prefer independent subtasks**');
    expect(prompt).toContain('**Avoid creating sequential chains**');
});

test('the Tasks family names every verb and points at the Manual; there is no Boards family', () => {
    expect(prompt).toContain(
        '15. **Tasks**: `haus task start`, `haus task list`, `haus task show`, `haus task state`, `haus task attach-pr`, `haus task update`, `haus task assign`. Read the `tasks` Manual topic before the first one.\n16. **Manual**'
    );
    expect(prompt).not.toContain('**Boards**');
    expect(prompt).not.toContain('haus task create');
    expect(prompt).not.toContain('haus task move');
});

test('the section sits with the other work primitives, after the claim sections', () => {
    expect(prompt.indexOf('### Tasks')).toBeGreaterThan(
        prompt.indexOf('### Splitting work for parallel execution')
    );
    expect(prompt.indexOf('### Tasks')).toBeLessThan(prompt.indexOf('## @Mentions'));
});

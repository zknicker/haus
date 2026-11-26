import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

const prompt = renderAgentInstructions({
    agentId: 'agt_prompt_test',
    agentName: 'Wren',
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
        'A Task is how people follow work that takes longer than a reply. While it is active it sits in their sidebar. It has its own page, where you and they talk about that work and where any Workers doing it are shown. When it is archived, it leaves.'
    );
    expect(tasks).toContain(
        'Create a Task when the work will not be finished in your reply: it needs more steps, more time, or a Worker. When your reply is the whole of the work, just reply. A Task does not mark work as yours; your claim already does that.'
    );
    expect(prompt).toContain('**Claim rule:**');
    expect(prompt).toContain('A failed claim is a concurrency lock');
});

test('a Task starts from a channel message, with the command shape beside it', () => {
    expect(tasks).toContain(
        'A Task starts from a message in a channel, usually the request itself, or a message you post when there is none: `haus task start --target "#channel" --from <shortid> --title <text>`.'
    );
    expect(tasks).not.toContain('Never from a DM');
});

test('Tasks start in the home Project, and other Projects get an @mention in their channel', () => {
    expect(tasks).toContain(
        'You start Tasks in your Project. Work that belongs to another Project goes to its Agents with an @mention in its channel, where everyone sees it.'
    );
});

test('each Task has its own end, and the work goes in the Task', () => {
    expect(prompt).toContain('Work for a Task is posted with `--target task:<shortId>`.');
    expect(tasks).toContain(
        'People see each Task under that message with its latest line. Each has its own end, so separate pieces of work are separate Tasks, and several can start from one message. Reply with a link to the Task; the work itself goes in the Task.'
    );
    expect(prompt).not.toContain('KEY-n');
});

test('a Task being worked or waited on stays active, and an after-the-fact check is part of the work', () => {
    expect(tasks).toContain(
        'A Task you are working or waiting on stays active, where the people following it can see it. Archive it with `haus task archive` when the work is finished; a check that has to happen after the work lands is part of the work.'
    );
    for (const gone of [
        'Work Tasks others assign you one at a time',
        'set it back to `todo`',
        'stays `open`',
        'do not repeat the result in the channel',
    ]) {
        expect(tasks).not.toContain(gone);
    }
});

test('the open Issues assigned to the agent are its queue (ADR 0062)', () => {
    expect(tasks).toContain(
        "Work waiting to be done lives in Issues, cards in a Project's backlog coded like `GEN-12`. The open Issues assigned to you are your queue, by priority then age: `haus issue list`."
    );
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

test('splitting for other agents files Issues, and claims stay in the conversation', () => {
    expect(prompt).toContain(
        'Subtasks for other agents are Issues: file one for each with `haus issue create` and assign it. Claims stay for work inside a conversation, including a split that stays there.'
    );
    expect(prompt).toContain(
        'When you receive a notification about new claims in a conversation, check the claim list and claim those relevant to your skills; Issues assigned to you are already yours.'
    );
    expect(prompt).toContain('**Group by phase** if tasks have dependencies.');
    expect(prompt).toContain('**Prefer independent subtasks**');
    expect(prompt).toContain('**Avoid creating sequential chains**');
});

test('the Tasks and Issues families name every verb and point at the Manual', () => {
    expect(prompt).toContain(
        '15. **Tasks**: `haus task start`, `haus task list`, `haus task show`, `haus task archive`, `haus task attach-pr`. Read the `tasks` Manual topic before the first one.\n16. **Issues**: `haus issue list`, `haus issue show`, `haus issue create`, `haus issue update`, `haus issue comment`, `haus issue link`. Read the `issues` Manual topic before the first one.\n17. **Computers**'
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

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

test('a Task is the Captain’s crew, a session people can talk to (ADR 0062)', () => {
    expect(tasks).toContain(
        'A Task is your crew: a fresh agent session with its own chat that does one piece of work taking longer than a reply, on its own Machine. People see it under the message it started from, follow it in their sidebar, and can talk to it there.'
    );
    expect(prompt).toContain('**Claim rule:**');
    expect(prompt).toContain('A failed claim is a concurrency lock');
});

test('a Task starts with its brief on stdin, which is all it knows', () => {
    expect(tasks).toContain(
        'Start one with its brief on stdin: `haus task start --title <text> --target <the chat you answer in> --from <shortid> < brief`, adding `--issue <code>` or `--repo <owner/name>` when it has them. The brief is its first message and all it knows of your conversation, so make it complete.'
    );
    expect(tasks).toContain('so make it complete. Separate pieces of work are separate Tasks.');
    expect(tasks).not.toContain('Reply with a link to the Task');
    expect(tasks).not.toContain('just reply');
});

test('Tasks start in the home Project, and other Projects get an @mention in their channel', () => {
    expect(tasks).toContain(
        'You start Tasks in your Project. Work that belongs to another Project goes to its Agents with an @mention in its channel, where everyone sees it.'
    );
});

test('crew report to the Captain, the asker talks to the Captain, and task send messages a Task', () => {
    expect(tasks).toContain(
        'Your crew reports to you, and the person who asked talks to you. `haus task send <shortId>` messages a Task and brings back an archived one. Archive a Task with `haus task archive` when the work is finished; a check that has to happen after the work lands is part of the work.'
    );
    // The Server refuses `message send` into a Task's chat and names `haus task send`.
    expect(prompt).not.toContain('never `message send`');
    expect(prompt).not.toContain('Work for a Task is posted with');
    expect(prompt).not.toContain('KEY-n');
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
        '14. **Tasks**: `haus task start`, `haus task send`, `haus task list`, `haus task show`, `haus task archive`, `haus task unarchive`, `haus task attach-pr`. Read the `tasks` Manual topic before the first one.\n15. **Issues**: `haus issue list`, `haus issue show`, `haus issue create`, `haus issue update`, `haus issue comment`, `haus issue link`. Read the `issues` Manual topic before the first one.\n16. **Computers**'
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

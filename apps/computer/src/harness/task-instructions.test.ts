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

test('a Task starts from a channel message, never a DM, with the command shape beside it', () => {
    expect(tasks).toContain(
        'A Task starts from a message in a channel, usually the request itself: `haus task start --target "#channel" --from <shortid> --title <text>`.'
    );
    expect(tasks).toContain(
        'Never from a DM: post the origin in the channel where the work belongs, mentioning whoever asked, start the Task from it, then reply in the DM with its key.'
    );
});

test('work for a Task reports there, and an after-the-fact check keeps it open', () => {
    expect(tasks).toContain('Report work done for a Task in the Task.');
    expect(prompt).toContain('Work for a Task is posted with `--target task:<KEY-n>`.');
    expect(tasks).toContain(
        'When the work is finished, set it `done` with `haus task state`; if a check must happen after the work lands, keep it open with a one-time reminder on the Task until the check passes.'
    );
});

test('the result lives in the Task, which the channel already previews', () => {
    expect(tasks).toContain(
        'Report work done for a Task in the Task. People see the Task under the message that started it, with its state and latest line, so do not repeat the result in the channel.'
    );
});

test('Tasks others assign are paced one at a time; self-started Tasks run side by side', () => {
    expect(tasks).toContain(
        'Work Tasks others assign you one at a time: pick by priority, then age, set that one `open`, and leave the rest `todo` until it is done or blocked. Tasks you started yourself can run side by side.'
    );
    // The pacing rule leads into the blocked rule, which says what "blocked" means.
    expect(tasks.indexOf('Work Tasks others assign you one at a time')).toBeLessThan(
        tasks.indexOf('When a Task is blocked on a person')
    );
});

test('a Task blocked on a person goes back to todo while other work goes on', () => {
    expect(tasks).toContain(
        'When a Task is blocked on a person, @mention them in the Task, set it back to `todo`, and take other work; leave it until they answer.'
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

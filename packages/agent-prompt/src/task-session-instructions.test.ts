import { expect, test } from 'bun:test';
import { renderTaskInstructions } from './task-session-instructions.ts';

const base = {
    agentId: 'agt_task_prompt',
    hostname: 'computer.test',
    os: 'macOS',
    runtimeVersion: 'test',
    workspacePath: '/workbench',
};
const task = {
    captainHandle: 'orbit',
    driveFolders: [
        'agents/orbit/reports/k3mq7xta',
        'agents/orbit/renders/k3mq7xta',
        'agents/orbit/handoffs/k3mq7xta',
    ],
    issues: [],
    repo: { name: 'haus/haus', ref: 'main' },
    shortId: 'k3mq7xta',
    title: 'Rotate the signing key',
};

test('a crew Task works in its one chat and its Captain reads it when a turn ends', () => {
    const prompt = renderTaskInstructions({ ...base, task });
    expect(prompt).toContain(
        'You are a Haus Task: one agent session with its own chat, `task:k3mq7xta`, working on one piece of work, "Rotate the signing key". Your Captain @orbit started you as crew; its brief is the first message in your chat.'
    );
    expect(prompt).toContain('Post there with `haus message send --target task:k3mq7xta`');
    expect(prompt).toContain('End every commit with `Haus-Task: k3mq7xta`.');
    expect(prompt).toContain(
        'Haus checks out haus/haus at main for you when your session starts; your first input says where.'
    );
    expect(prompt).toContain(
        'Put deliverables in Drive with `haus drive write <path> --from <file>` under `agents/orbit/reports/k3mq7xta/`, `agents/orbit/renders/k3mq7xta/`, `agents/orbit/handoffs/k3mq7xta/`, and cite the link it prints.'
    );
    expect(prompt).toContain(
        'Your Captain hears when each of your turns ends and reads your chat for what you did, so a question for it goes there like anything else. Your last message in a turn says where the work stands, with links.'
    );
    expect(prompt).toContain(
        'To ask a person, @mention them in your chat; you show as waiting on them until they answer, and their answer wakes you. `haus task attach-pr k3mq7xta <url>` attaches each pull request you open.'
    );
    expect(prompt).toContain(
        'a message body goes in a heredoc, and a file goes by its flag, such as `--from`.'
    );
    expect(prompt).not.toContain('haus task report');
    expect(prompt).toContain(
        "`haus task archive` archives you: your session ends and you leave your followers' sidebars."
    );
    expect(prompt).not.toContain('a turn a person drove');
    expect(prompt).not.toContain('MEMORY.md');
    expect(prompt).not.toContain('## Your Issues');
});

test('a Task a person started is read by its starter and has no Captain', () => {
    const prompt = renderTaskInstructions({
        ...base,
        task: {
            ...task,
            captainHandle: null,
            driveFolders: ['projects/GEN/tasks/k3mq7xta'],
            repo: null,
        },
    });
    expect(prompt).toContain(
        'A person started you; their first message in your chat is your brief.'
    );
    expect(prompt).toContain(
        'Whoever started you reads your chat. Your last message in a turn says where the work stands, with links. To ask a person, @mention them in your chat'
    );
    expect(prompt).toContain('under `projects/GEN/tasks/k3mq7xta/`');
    expect(prompt).not.toContain('Captain');
    expect(prompt).not.toContain('Haus checks out');
});

test('a Task working an Issue carries its code, title and description, and its trailer', () => {
    const prompt = renderTaskInstructions({
        ...base,
        task: {
            ...task,
            issues: [{ code: 'GEN-12', description: 'The key leaked.', title: 'Rotate it' }],
        },
    });
    expect(prompt).toContain('## Your Issues');
    expect(prompt).toContain('### GEN-12: Rotate it\n\nThe key leaked.');
    expect(prompt).toContain('`Haus-Task: k3mq7xta` and `Haus-Issue: GEN-12`.');
});

test('keeps the Task prompt within its reviewed size budget', () => {
    expect(renderTaskInstructions({ ...base, task }).length).toBeLessThanOrEqual(2602);
});

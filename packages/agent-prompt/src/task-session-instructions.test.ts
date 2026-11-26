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

test('a crew Task works in its one chat and reports the turns its Captain directed', () => {
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
        'Put deliverables in Drive with `haus drive write <path> < file` under `agents/orbit/reports/k3mq7xta/`, `agents/orbit/renders/k3mq7xta/`, `agents/orbit/handoffs/k3mq7xta/`, and cite the link it prints.'
    );
    expect(prompt).toContain(
        'End each turn your Captain directed (its brief, or its `haus task send`) with a report; a turn a person drove needs one only when it failed or needs your Captain.'
    );
    expect(prompt).toContain('to ask a person in your chat instead of your Captain');
    expect(prompt).not.toContain('MEMORY.md');
    expect(prompt).not.toContain('## Your Issues');
});

test('a Task a person started reports to its starter and has no Captain', () => {
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
    expect(prompt).toContain('Report when you finish or need your starter.');
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
    expect(renderTaskInstructions({ ...base, task }).length).toBeLessThanOrEqual(2658);
});

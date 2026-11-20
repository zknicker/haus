import type { ManualNavigationTopic } from './types.ts';

export const rulesTopic: ManualNavigationTopic = {
    id: 'rules',
    kind: 'overview',
    title: 'Rules',
    summary:
        'The rule files in Drive (the team and Project AGENTS.md, your own AGENTS.md and WORKER.md) beside MEMORY.md: who reads each and when, editing them in your drive/ folder, revisions, and citing them.',
    related: ['drive', 'cloud-agents'],
    body: `# Rules

Rules are the standing instructions people give for future work. They live in Drive as plain Markdown files, one per audience, and everyone on the team can read and edit them.

## The files

- \`drive/haus/AGENTS.md\` holds the team's rules. People own it. Haus puts it in your turn input whenever it changed.
- \`drive/projects/<key>/AGENTS.md\` holds a Project's rules for everyone working in it. Drive does not accept files under \`projects/\` yet.
- \`drive/agents/<your handle>/AGENTS.md\` holds your own rules: how you work, reply, and decide. Haus puts it in your turn input whenever it changed, and again after a reset or compaction, the way it delivers MEMORY.md.
- \`drive/agents/<your handle>/WORKER.md\` holds the rules your Workers follow. Workers are the runs you start for a Task, such as cloud agents. Haus does not hand this file to a cloud agent yet, so its rules travel in the brief you launch it with.
- \`drive/agents/<your handle>/MEMORY.md\` holds what you know: facts, your active context, the preferences people show in passing, and the index of your notes. It can point at your rule files without repeating them.

## Editing

You edit these files in your \`drive/\` folder with your edit tool, and create one when it is missing. Each rule is one terse imperative line, and a changed rule replaces its old line.

Haus sends your edit when your turn ends and keeps it as a revision with you as its author, so anyone can read the file and its history (\`haus drive versions <path>\`). A citation such as \`[WORKER.md](drive://agents/<your handle>/WORKER.md)\` in your reply opens the file beside the chat. The \`drive\` topic covers the folder, conflicts, and citations.`,
};

import type { ManualNavigationTopic } from './types.ts';

export const rulesTopic: ManualNavigationTopic = {
    id: 'rules',
    kind: 'overview',
    title: 'Rules',
    summary:
        'Where a standing rule goes when someone says "from now on": your AGENTS.md, your WORKER.md, or a Project\'s AGENTS.md in Drive, never MEMORY.md, and how to edit it in your drive/ folder.',
    related: ['drive', 'cloud-agents'],
    body: `# Rules

A rule is a standing instruction someone sets for future work, usually with "from now on". Rules live in Drive as plain files, one per audience. MEMORY.md holds facts, so a rule never goes there. Preferences you notice in passing, with no rule set, stay under Standing Preferences in MEMORY.md.

## Which file

- \`drive/agents/<your handle>/AGENTS.md\` holds your own rules: how you work, reply, and decide.
- \`drive/agents/<your handle>/WORKER.md\` holds the rules for every Worker you run. Workers are the runs you start for a Task, such as cloud agents. Haus does not hand a cloud agent this file, so put its rules in the brief you launch it with.
- \`drive/projects/<key>/AGENTS.md\` holds the rules for everyone working in that Project. Drive does not accept files under \`projects/\` yet, so say that a Project rule cannot be saved there.
- \`drive/haus/AGENTS.md\` holds the team's rules. People own it; edit it only when asked.

The audience the rule governs picks the file. "From now on, every Worker attaches before/after screenshots" governs what your Workers do, so it goes in your \`WORKER.md\`, even though you are the one who checks it. "From now on, keep replies under three sentences" goes in your \`AGENTS.md\`. "My timezone is Pacific" is a fact, not a rule, and goes in MEMORY.md.

## Edit it

Edit the file in your \`drive/\` folder with your edit tool, and create it if it is missing. Write each rule as one terse imperative line, and rewrite a rule it changes rather than adding a second line beside it. A rule you find in MEMORY.md belongs in its rule file: move it there.

Haus sends the change when your turn ends and keeps it as a revision with you as its author, so anyone can read the file and its history (\`haus drive versions <path>\`). Your \`AGENTS.md\` and \`drive/haus/AGENTS.md\` arrive in your turn input whenever they change and after a reset or compaction, like MEMORY.md. Cite the file in your reply, such as \`[WORKER.md](drive://agents/<your handle>/WORKER.md)\`, so people can open what changed. The \`drive\` topic covers the folder, conflicts, and citations.`,
};

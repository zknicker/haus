import type { ManualNavigationTopic } from './types.ts';

/** Repos belong to the Server, and an Agent works in its own worktree of one (ADR 0060). */
export const reposTopic: ManualNavigationTopic = {
    aliases: ['repo folders', 'repo checkout', 'worktree'],
    body: `# Repos

A repo is a GitHub \`owner/name\` on the Server's list, and any Agent or Worker in any Project can use any of them. A repo joins the list when a Computer gets a folder for it or a Worker starts on it. Each Computer lists where its repos live as repo folders, one per repo. The person who attached the Computer adds them at Settings → Devices → (the device) → Repositories, or with \`haus-computer repo add <path>\` on the machine.

\`haus repo list\` shows each repo and the Computers with a folder for it. A Worker can use a repo with no folder: its Computer clones it first (see workers).

**Your own checkout.** \`haus repo checkout <owner/name> [--ref <ref>]\` makes your git worktree of that Computer's folder, on your own branch \`haus/<agent-id>/<name>\`, from \`--ref\` or the remote's default branch after a fetch. The receipt prints the path and the branch; \`cd\` into the path and work there. A second checkout of the repo reuses the same worktree. A different \`--ref\` resets a clean worktree to that ref and refuses one with uncommitted or unpushed work.

**Only repos with a folder.** A checkout works only for a repo with a folder on that Computer, and it never clones. Without one it refuses and names the Computer's folders; ask the person who attached that Computer to add one.

**Cleanup.** A clean worktree, with nothing uncommitted and every commit already on the remote, goes 7 days after its last use, and the branch stays. Work that is not on the remote is never deleted.`,
    id: 'repos',
    kind: 'overview',
    related: ['workers', 'tasks'],
    summary:
        "List the Server's repos and the Computers with a folder for each, and check one out into your own worktree.",
    title: 'Repos',
};

import type { ManualNavigationTopic } from './types.ts';

/** Repos belong to the Server, and an Agent works in its own worktree of one (ADR 0060). */
export const reposTopic: ManualNavigationTopic = {
    aliases: ['repo folders', 'repo checkout', 'worktree', 'git push', 'co-author'],
    body: `# Repos

A repo is a GitHub \`owner/name\` on the Server's list, and any Agent in any Project can use any of them. A repo joins the list when a Computer gets a folder for it. Each Computer lists where its repos live as repo folders, one per repo. The person who attached the Computer adds them at Settings → Repositories → Add repository, at Settings → Devices → (your device) → Folders → Add folder, or with \`haus-computer repo add <path>\` on the machine.

\`haus repo list\` shows each repo and the Computers with a folder for it.

**Your own checkout.** \`haus repo checkout <owner/name> [--ref <ref>]\` makes your git worktree of that Computer's folder, on your own branch \`haus/<agent-id>/<name>\`, from \`--ref\` or the remote's default branch after a fetch. The receipt prints the path and the branch; \`cd\` into the path and work there. A second checkout of the repo reuses the same worktree. A different \`--ref\` resets a clean worktree to that ref and refuses one with uncommitted or unpushed work.

**Only repos with a folder.** A checkout works only for a repo with a folder on that Computer, and it never clones. Without one it refuses and names the Computer's folders; ask the person who attached that Computer to add one.

**Commits, pushes and pull requests.** In your worktree you commit, push your branch and open its pull request yourself, as the Server's Haus GitHub App. Your commits are authored by the App's bot, so end each one with a \`Co-authored-by:\` trailer for each person whose message you are acting on: \`haus repo co-author @handle [@handle...]\` prints the lines, for example \`git commit -m "Fix the header" -m "Co-authored-by: Ada Lovelace <ada@example.com>"\`. Push with plain \`git push -u origin HEAD\`: git gets a short-lived token for that one repo from Haus, never the machine's own GitHub login. Open the pull request from your \`haus/\` branch with the GitHub connection's \`create_pull_request\`, which also runs as the bot. A push is refused when the App has no access to the repo, or you have no access to the GitHub connection; the error names which, and who can fix it. GitHub refuses a push that changes \`.github/workflows/\`; ask a person to make that change.

**Cleanup.** A clean worktree, with nothing uncommitted and every commit already on the remote, goes 7 days after its last use, and the branch stays. Work that is not on the remote is never deleted.`,
    id: 'repos',
    kind: 'overview',
    related: ['tasks'],
    summary:
        "List the Server's repos and the Computers with a folder for each, check one out into your own worktree, and commit, push and open pull requests there.",
    title: 'Repos',
};

---
status: proposed
summary: A Project is an area of work and asks for no repos. Repos belong to the Server, identified by GitHub `owner/name`, and any Agent or Worker in any Project may use any of them. Each Computer lists where its repos live as repo folders, added by its attacher from the Device page or `haus-computer repo add`, and clones a repo it has no folder for into `~/.haus/computer/repos/<owner>/<name>` the first time it is needed. Workers and Agents work in git worktrees of that folder at `<dataRoot>/servers/<serverId>/worktrees/<worker-or-agent-id>/<owner>/<name>/`, so a Worker's branch shows in the person's repo while it works; this reverses the 2026-11-21 move to separate local clones and names its costs. A Worker may take several repos, and an Agent gets a worktree with `haus repo checkout`. A Worker's clean, pushed worktrees go when it closes, and an Agent's are pruned after 7 days idle; unpushed work always stays. `project_repos` and `project_repo_links` retire. Proposed 2026-11-22, not yet implemented.
read_when:
  - changing where repos are recorded, how a Computer finds or clones a repo, or repo folders
  - changing Project creation or Project settings that mention repos
  - changing where a Worker or Agent checks out a repo, its worktree path, its branch, or its cleanup
  - changing `haus worker start --repo`, `haus repo list`, `haus repo checkout`, or `haus-computer repo`
  - changing the Codex Worker sandbox's writable roots
  - migrating or deleting `project_repos` or `project_repo_links`
---

# ADR 0060: Repos Belong to the Server, and Agents Work in Worktrees

## Status

Proposed 2026-11-22. Not yet implemented. Amends
[ADR 0055](0055-projects-own-agents-and-tasks.md) decisions 2 and 4,
[ADR 0056](0056-agents-run-quiet-workers-anywhere.md) decisions 6 and 7 and its 2026-11-21
follow-up, [specs/projects.md](../../specs/projects.md) and
[specs/workers.md](../../specs/workers.md). Companion to
[ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 4 (amended
2026-11-22), which decides which Computer a tool call runs on. This ADR decides which repos the
call reaches there and where Workers and Agents work on disk.

## Context

- **Repos are per Project today.** A `project_repos` row is a Project and an `owner/name`, and a
  `project_repo_links` row makes one available on a Computer, with an optional checkout path
  (`apps/server/src/postgres/schema/project-repos.ts`). A Worker start defaults `--repo` to the
  Project's only repo, and a Computer place refuses a repo with no link
  (`WORKER_REPO_NOT_LINKED`, [specs/workers.md](../../specs/workers.md#the-cli)).
- **Production does not work that way** (read 2026-11-22):
  - tech-ops's Workers touched 13 repos, and merchbase-core was worked on from 4 Projects;
  - `project_repos` has one row (tech-ops → merchbase-core), and `project_repo_links` is empty;
  - all 191 Workers ran in the cloud (125 Cursor, 66 Claude), so the Computer checkout path has
    never run in production.
- **A Worker on a Computer works in its own clone.** It is a hardlinked local clone of the base
  clone, at `servers/<serverId>/workers/<worker-id>/checkout/`, and its branches reach the
  person's folder only when it closes ([specs/workers.md](../../specs/workers.md#layout)). That
  replaced `git worktree` on 2026-11-21 (#424, ADR 0056 follow-up). A worktree shares
  `packed-refs`, remote-tracking refs, config and `gc` state with its base, and under Codex's
  narrowed writable roots a Worker could not fetch, keep a push's upstream, delete its own branch
  or `gc`.
- **An Agent has no checkout.** Its commands run in its per-Agent workspace (ADR 0057 decision
  4).
- **Prior art.**
  - Capy gives each Project an ordered repo list with a primary and lazy split. Each device keeps
    linked folders matched by git remote (`~/.capy/device/workspaces.json`, 12 on Zach's Mac), and
    each thread gets `~/.capy/worktrees/<jamId>/<repo>/`, detached worktrees of those folders.
  - Claude Code keeps its worktrees inside the repo, under `.claude/worktrees/`. Codex keeps them
    outside it, under `~/.codex/worktrees/<id>/`.
  - Zach prefers the Claude Code and Codex model to Capy's, because it is more flexible and
    configurable.

## Decision

1. **A Project is an area of work, not a repo.** New project asks for a name and a purpose (the
   channel description). The Server allocates the key, as the shipped dialog already does. There
   is no repo step and no per-Project repo list. The default place for Workers stays a Project
   setting.

2. **Repos belong to the Server.** A repo is a GitHub `owner/name`, lower-cased, one row per
   Server in a new `repos` table. Any Agent or Worker in any Project may use any repo. A repo
   joins the list when a Computer gets a folder for it, and the first time a Worker start or
   `haus repo checkout` names it. `haus repo list` shows each repo and the Computers that have a
   folder for it.

3. **Each Computer lists where its repos live.** A repo folder is an existing checkout on that
   Computer, for example `~/Programming/merchbase-core`, in a new `repo_folders` table: the
   Computer, the repo, the absolute path, and who added it, with one folder per repo per Computer.
   - **Adding one.** The Computer reads the folder's `origin` remote with the parser that already
     checks Worker base clones (`repositoryOfRemote`, `apps/computer/src/workers/computer/repos.ts`),
     and the Server records the repo it names. A folder with no GitHub `origin` is refused. The
     same repo on two Computers is one repo.
   - **Who.** Only the Computer's attacher adds a folder, as only the attacher grants Agent access
     (ADR 0057 decision 4): a folder points Agents' worktrees and branches into that person's own
     checkout. The attacher, Owners and Admins can remove one. Today the attacher, Owners and
     Admins link a repo ([specs/projects.md](../../specs/projects.md#repos)).
   - **How.** On the Computer's settings page in the App (Settings → Devices, "Add folder"),
     which needs the Computer online so it can read the remote, and with `haus-computer repo add <path>` on the machine, which acts as
     the person signed in to Haus Computer
     ([ADR 0022](0022-computer-login-sessions-authorize-management.md)). `haus-computer repo list`
     and `haus-computer repo remove` complete the CLI.
   - **Without a folder.** A Computer that needs a repo it has no folder for clones it once into
     Haus's standard repo folder, `<dataRoot>/repos/<owner>/<name>`, which is
     `~/.haus/computer/repos/<owner>/<name>` (`repoClonePath`,
     `apps/computer/src/workers/computer/layout.ts`), with the machine's own `gh` or git login. That
     clone then serves as the folder. A failed clone fails the launch or checkout and names the
     repo.

4. **Worker and Agent copies are git worktrees of the folder,** kept outside it at:

   ```text
   <dataRoot>/servers/<serverId>/worktrees/<id>/<owner>/<name>/
   ```

   `<dataRoot>` is `~/.haus/computer`. `<id>` is the Worker id (`wkr_…`) or, for an Agent, the
   Agent id (`agt_…`). This is Zach's `~/.haus/worktrees/<id>/<repo>`, placed in the data root and
   in the Server partition the data root already has:
   - **Outside the repo**, as Codex does, so the person's `git status`, editor and file watchers
     never see it. Claude Code's `.claude/worktrees/` sits in the repo's tree and needs an ignore
     rule in every repo.
   - **Under the Server's partition**, because ids are minted per Server and everything an
     attachment owns already lives there (`agents/`, `workers/`). Detaching, retirement and the
     reconnect sweep each scan one folder.
   - **One root for Workers and Agents**, so `git worktree list` in a folder shows every Haus
     copy under one prefix, and one prune pass covers both.
   - **`<owner>/<name>`**, like `repos/<owner>/<name>`, so two repos with the same name never
     collide. The leaf is still the repo's name.

   **Why worktrees.** This reverses the 2026-11-21 choice of separate clones. People know
   worktrees from Claude Code and Codex, and a Worker's branch shows in the person's repo while it
   works, so they can `git log`, diff or check it out without waiting for the Worker to close.

   **The costs.**
   - **Shared refs, config and `gc`.** A Worker's ref, `packed-refs` and config writes land in the
     person's repo, and a `gc` or `git worktree prune` on either side acts on all of them.
   - **Lock contention.** Workers and the person contend for `packed-refs.lock` and
     `config.lock`, so a concurrent git command can fail with a lock error and need a retry.
   - **Codex's sandbox.** A Codex Worker needs the folder's whole `.git` writable, because the
     narrowed roots are exactly what failed in #424. So it can move the person's `main` or delete
     another branch, which the separate clone prevented
     ([specs/workers.md](../../specs/workers.md#run-a-turn) step 5). Claude Code Workers already
     run unsandboxed as the machine user (ADR 0056 decision 7), so this adds no trust that
     **Workers can run here** has not granted, but the narrowing is gone.
   - **The folder is a dependency.** If the person deletes or moves it, every worktree of it
     breaks, because each worktree's `.git` file points into the folder, and commits that lived
     only on local branches go with it. Haus checks the folder and its `origin` before each launch
     and checkout, refuses with the path when it is gone, shows it as missing on the Computer's
     settings page, and never deletes a broken worktree on its own.
   - **Visible side effects.** The Computer fetches in the folder before it branches, which moves
     the person's remote-tracking refs. A branch checked out in a worktree cannot be checked out in
     the folder at the same time. Git refuses, which is the right answer while a Worker works on
     it.

5. **Several repos.** `haus worker start --repo` is required and repeatable. On a Computer place
   each repo gets its own worktree under the Worker's folder, each on the branch
   `haus/<worker-id>/<key>-<n>`, and the harness starts in the first. A cloud place takes exactly
   one repo, as today, and a start that names several for it refuses with `WORKER_OPTION_CLOUD`.
   The Worker record's `repository` becomes an ordered list. An Agent gets a worktree when it asks:
   `haus repo checkout <owner/name> [--ref <ref>]` runs on the runner and sends a `repo-checkout`
   invocation to the Computer its `bash` or `shell` call targeted (ADR 0057 decision 5). That
   Computer adds or reuses the worktree, detached at the ref or the remote default branch after a
   fetch, and the receipt prints its path. The Agent `cd`s into it.

6. **Cleanup.** Work that is not pushed is never deleted. A worktree is clean when it has no
   uncommitted or untracked changes and every commit on it is on a remote-tracking ref.
   - **A Worker.** Closing it ([specs/workers.md](../../specs/workers.md#closing)) removes each
     clean worktree and deletes its local branch, which the remote keeps. Any other worktree stays
     with its branch, and the delegating Agent's final `worker_report` item and the Worker card say
     which ones and where. On each connect the Computer still reports held Workers
     (`worker-held`) and removes a kept worktree once it is clean or the person has deleted it.
   - **An Agent.** Its worktrees are scratch. The Computer prunes a clean one 7 days after its
     last `haus repo checkout`, and the receipt says so. A week covers a weekend and on-and-off
     work. What costs disk is the full working tree, with its dependencies and build output, not
     the shared objects.
   - **Retirement.** Retiring an Agent (ADR 0057 decision 4) force-removes its worktrees on every
     Computer and prunes them from each folder. Committed branches stay in the folder.

7. **`project_repos` and `project_repo_links` retire.** The migration:
   - makes a `repos` row for each distinct `workers.repository` on a Server and for the one
     `project_repos` row (tech-ops → merchbase-core). The 191 Workers keep their repository as the
     one entry in their list;
   - migrates no folder, because `project_repo_links` is empty. The first Computer-place Worker
     for a repo clones it into the standard folder unless the attacher has added one;
   - deletes both tables, `project.addRepo`, `removeRepo`, `linkRepo` and `unlinkRepo`,
     `WORKER_REPO_NOT_LINKED`, the `repo-unlinked` launch failure, and the W3 auto-add.
     `WORKER_REPO_UNKNOWN` now means the start named no repo.

8. **Cloud Workers keep cloning from GitHub.** For Cursor and Claude cloud Workers the repo list
   only names the repo. They never need a folder.

## Considered and rejected

- **A per-Project repo list**, as Capy and today's schema have. Production Workers cross Projects
  freely, and any Agent can already reach any Project
  ([specs/projects.md](../../specs/projects.md#what-an-agent-may-do-outside-its-home)), so the
  list is upkeep that narrows nothing.
- **Capy's primary and lazy repos.** Cloning and snapshotting primary repos at boot speeds up a
  fresh cloud VM. A persistent Computer already has the folder.
- **Keeping separate clones.** They work under Codex's narrowed sandbox and keep the person's refs
  apart, but a Worker's branch stays hidden until it closes, and the layout is one people do not
  know.
- **Worktrees inside the repo**, as Claude Code does. They show up in the person's tree, editor and
  watchers, and every repo needs an ignore rule.
- **Owners and Admins adding folders.** A folder sends Agents' branches into one person's own
  checkout on their own machine, so that person decides.
- **A registry kept only on the Computer**, like Capy's `workspaces.json`. The Server could not
  show folders in the App or in `haus worker places`, or check who added one.

## Consequences

Amended:

- [ADR 0055](0055-projects-own-agents-and-tasks.md) decision 2: a Project's settings carry no
  repos. Decision 4: a Task's Project gives its Workers their rules and default place, not their
  repos.
- [ADR 0056](0056-agents-run-quiet-workers-anywhere.md) decision 6: the default place stays on the
  Project because a Project groups the work, not because repos are linked there. Decision 7 and
  its 2026-11-21 follow-up: a Worker on a Computer works in a worktree of that Computer's folder.
- [specs/projects.md](../../specs/projects.md) and [specs/workers.md](../../specs/workers.md) carry
  a dated note at each section this replaces, until the rewrite.

Deleted: `project_repos`, `project_repo_links`, their four procedures, `WORKER_REPO_NOT_LINKED`,
`repo-unlinked`, the W3 repo auto-add, and the Worker's separate clone.

Deferred: a Server-level Repos settings page, base branches per repo, and setup scripts per repo.

Follow-up:

- Rewrite [specs/projects.md](../../specs/projects.md) "Creating a Project", "Settings", "Repos"
  and "Archiving and deleting".
- Rewrite [specs/workers.md](../../specs/workers.md) "Record", "The CLI", "Layout", "Run a turn"
  (step 5's Codex roots), "Closing" and "W3 transitional decisions", and the repo column of
  `haus worker places`, which lists each Computer's folders.
- The `repos` and `repo_folders` tables, the migration, `haus repo list` and
  `haus repo checkout`, the `repo-checkout` invocation, `haus-computer repo add|list|remove`, and
  the folder list on the Computer's settings page.
- The prompt's command families gain a `repo` entry beside `computer`, through the prompt
  contract and the register row "Communication — CLI ONLY, command families". The Manual's
  `workers` topic and a new repos topic teach the rest.
- Update [docs/api/agents.md](../api/agents.md), [docs/api/projects.md](../api/projects.md) and
  [docs/internals/data-model.md](../internals/data-model.md) when this lands.

## Open questions

- **Codex's writable `.git`.** Whether to accept that a Codex Worker can move the person's `main`,
  or keep separate clones for Codex Workers only and worktrees for Claude Code Workers.
- **Pushed branches on close.** Whether closing deletes a Worker's pushed local branch, as
  decided, or leaves every `haus/…` branch in the person's repo until they delete it.
- **The idle period.** Whether 7 days is right for an Agent's scratch worktrees.
- **Repos nobody added.** Whether naming any `owner/name` in a start or checkout should add it to
  the Server's list, as decided, or only repos with a folder or a past Worker count.
- **The path's repo segment.** Whether `<owner>/<name>` is worth the extra folder over Zach's
  `<repo>`.

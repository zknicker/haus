---
status: proposed
summary: A Project is an area of work and asks for no repos. Repos belong to the Server, identified by GitHub `owner/name`, and any Agent or Worker in any Project may use any of them. Each Computer lists where its repos live as repo folders, added by its attacher from the Device page or `haus-computer repo add`; a Worker that needs a repo with no folder clones it into the Server's partition, and that clone becomes the folder. Workers and Agents work in git worktrees of the folder at `<dataRoot>/servers/<serverId>/worktrees/<worker-or-agent-id>/<owner>/<name>/`, for Claude Code and Codex alike, reversing the 2026-11-21 move to separate clones; a Codex Worker writing hooks or config into the shared `.git`, or moving `main`, is an accepted risk disclosed at "Add folder". A Worker takes one repo. An Agent gets a worktree on its own named branch with `haus repo checkout`, only for repos already on that Computer, and commits, pushes and opens pull requests there as the Server's Haus GitHub App bot, with the person who asked as co-author. A Worker's worktree goes when it closes once its commits are on the remote, an Agent's after 7 days unused once clean, and unpushed work always stays. A repo joins the Server's list only after a successful folder add or clone. `project_repos` and `project_repo_links` retire. Implemented 2026-11-22; Agent pushes, pull requests and commit identity (slice C) 2026-11-23. Amended 2026-11-23: when an Agent's Machine changes, its worktrees and uncommitted work stay on the old Mac.
read_when:
  - changing where repos are recorded, how a Computer finds or clones a repo, or repo folders
  - changing Project creation or Project settings that mention repos
  - changing where a Worker or Agent checks out a repo, its worktree path, its branch, or its cleanup
  - changing `haus worker start --repo`, `haus repo list`, `haus repo checkout`, or `haus-computer repo`
  - changing the Codex Worker sandbox's writable roots, or the "Add folder" disclosure
  - changing an Agent's commit identity, its branch prefix, or how it pushes and opens pull requests
  - changing which login a checkout, cleanup or purge fetch of an Agent's worktree uses
  - migrating or deleting `project_repos` or `project_repo_links`
  - changing what happens to an Agent's worktrees when its Machine changes
---

# ADR 0060: Repos Belong to the Server, and Agents Work in Worktrees

## Status

Proposed 2026-11-22. Not yet implemented. Revised 2026-11-22 after a council review: worktrees
stay, by Zach's call, and the review's other answers and must-fixes are applied. Revised again
2026-11-22 with Zach's answers: Agents commit, push and open pull requests themselves as the Haus
GitHub App bot, with the person who asked as co-author. Amends
[ADR 0055](0055-projects-own-agents-and-tasks.md) decisions 2 and 4,
[ADR 0056](0056-agents-run-quiet-workers-anywhere.md) decisions 6 and 7 and its 2026-11-21
follow-up, [specs/projects.md](../../specs/projects.md) and
[specs/workers.md](../../specs/workers.md). Companion to
[ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 4 (amended
2026-11-22), which decides which Computer a tool call runs on. This ADR decides which repos the
call reaches there and where Workers and Agents work on disk.

Implemented 2026-11-22 (slice B). Agent pushes, pull requests and commit identity in decision 5
implemented 2026-11-23 (slice C), as
[specs/github-app-connection.md](../../specs/github-app-connection.md#git-on-a-computer) describes.

Amended 2026-11-23 by
[ADR 0057's Machine amendment](0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer):
[worktrees stay on the old Mac](#amendment-2026-11-23-worktrees-stay-on-the-old-mac) when an
Agent's Machine changes.

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
  person's folder only when it closes, through `keepBranches`
  (`apps/computer/src/workers/computer/checkout.ts:78`). That replaced `git worktree` on
  2026-11-21 (#424, ADR 0056 follow-up). A worktree shares `packed-refs`, remote-tracking refs,
  config and `gc` state with its base, and under Codex's narrowed writable roots a Worker could
  not fetch, keep a push's upstream, delete its own branch or `gc`.
- **Haus's own clones are shared across Servers.** A Computer clones a repo with no link into
  `<dataRoot>/repos/<owner>/<name>` (`repoClonePath`,
  `apps/computer/src/workers/computer/layout.ts:42-48`), outside every Server's partition.
- **An Agent has no checkout.** Its commands run in its per-Agent workspace (ADR 0057 decision
  4).
- **Prior art.**
  - Capy gives each Project an ordered repo list with a primary and lazy split. Each device keeps
    linked folders matched by git remote (`~/.capy/device/workspaces.json`, 12 on Zach's Mac), and
    each thread gets `~/.capy/worktrees/<jamId>/<repo>/`, detached worktrees of those folders.
  - Claude Code keeps its worktrees inside the repo, under `.claude/worktrees/`. Codex keeps them
    outside it, under `~/.codex/worktrees/<id>/`. Both run worktrees of Zach's repos on this Mac
    every day, sharing each repo's `.git`.
  - Zach prefers the Claude Code and Codex model to Capy's, because it is more flexible and
    configurable.
  - A Capy Captain is a full thread that "acts as its owner": it commits, pushes and opens pull
    requests itself. Capy's Settings → Git sets the **Commit author**: "You, Capy co-author" by
    default, or "You", "Capy, you co-author" or "Capy". It also sets a commit email, signed
    commits and a branch prefix, with a per-PR override
    ([Capy GitHub docs](https://docs.capy.ai/integrations/github.md)).
- **Haus already has a GitHub bot.** The Server's Haus GitHub App mints installation tokens
  (`ghs_`, one hour, kept in memory; `createInstallationTokens` in
  `apps/server/src/github/github-bot.ts`), and `github-bot.ts` sends an Agent's GitHub MCP tool
  calls with them, so GitHub attributes them to the bot
  ([specs/github-app-connection.md](../../specs/github-app-connection.md#agent-identity)). The App
  holds Contents and Pull requests read and write, and `agent-signature.ts` adds "Posted by
  <Agent> via Haus" to pull request bodies and comments. An Agent can therefore already open a
  pull request as the bot through `execute`. Nothing gives git on a Computer a token to push
  with: installation tokens never leave the Server.

## Decision

1. **A Project is an area of work, not a repo.** New project asks for a name and a purpose (the
   channel description). The Server allocates the key, as the shipped dialog already does. There
   is no repo step and no per-Project repo list. The default place for Workers stays a Project
   setting.

2. **Repos belong to the Server.** A repo is a GitHub `owner/name`, lower-cased, one row per
   Server in a new `repos` table, with a CHECK that keeps it lower-case. Any Agent or Worker in
   any Project may use any repo. A repo joins the list only once a folder for it is added, or a
   Computer clones it, or a cloud provider starts a Worker on it. A typo or a refused start adds
   nothing. `haus repo list` shows each repo and the Computers that have a folder for it.

3. **Each Computer lists where its repos live.** A repo folder is a checkout on that Computer, in
   a new `repo_folders` table: the Computer, the repo, the absolute path, and who added it (null
   for Haus's own clone), with one folder per repo per Computer.
   - **Adding one.** The Computer reads the folder's `origin` remote and the Server records the
     repo it names. The parser that checks Worker base clones today,
     `repositoryOfRemote` (`apps/computer/src/workers/computer/git.ts:43-46`), takes the last two
     path segments of any URL, so adding a folder first requires the host to be `github.com`. A
     folder with no GitHub `origin` is refused. The same repo on two Computers is one repo.
   - **Who.** Only the Computer's attacher adds a folder, as only the attacher grants Agent access
     (ADR 0057 decision 4): a folder lets Agents and Workers into that person's own checkout and
     its `.git`. The attacher, Owners and Admins can remove one. Today the attacher, Owners and
     Admins link a repo ([specs/projects.md](../../specs/projects.md#repos)).
   - **How.** On the Computer's settings page in the App (Settings → Devices, "Add folder"),
     which needs the Computer online so it can read the remote, and with
     `haus-computer repo add <path>` on the machine, which acts as the person signed in to Haus
     Computer ([ADR 0022](0022-computer-login-sessions-authorize-management.md)).
     `haus-computer repo list` and `haus-computer repo remove` complete the CLI. "Add folder" says
     what it grants: "Workers and Captains work in git worktrees of this folder and share its
     `.git`. A Worker can change its branches, including `main`, and its hooks and config."
   - **Removing one** refuses while a worktree of it exists, and names the worktrees. Today
     nothing defines what removing a link with live checkouts does.
   - **Haus's own clone.** A Computer-place Worker whose repo has no folder there clones it once,
     with the machine's own `gh` or git login, into the Server's partition:
     `<dataRoot>/servers/<serverId>/repos/<owner>/<name>`. `repoClonePath` moves there, so two
     Servers on one Computer never share a Haus clone, its refs or its worktrees. The clone
     becomes the Computer's folder for that repo. Turning on **Workers can run here** is the
     attacher's consent to that login (ADR 0057 decision 4). A failed clone fails the launch and
     names the repo.

4. **Worker and Agent copies are git worktrees of the folder,** for Claude Code and Codex alike,
   kept outside it at:

   ```text
   <dataRoot>/servers/<serverId>/worktrees/<id>/<owner>/<name>/
   ```

   `<dataRoot>` is `~/.haus/computer`. `<id>` is the Worker id (`wkr_…`) or the Agent id
   (`agt_…`). This is Zach's `~/.haus/worktrees/<id>/<repo>`, placed in the data root and in the
   Server partition the data root already has:
   - **Outside the repo**, as Codex does, so the person's `git status`, editor and file watchers
     never see it. Claude Code's `.claude/worktrees/` sits in the repo's tree and needs an ignore
     rule in every repo.
   - **Under the Server's partition**, because ids are minted per Server and everything an
     attachment owns already lives there (`agents/`, `workers/`, and now `repos/`). Detaching,
     retirement and the reconnect sweep each scan one folder.
   - **One root for Workers and Agents**, so `git worktree list` in a folder shows every Haus
     copy under one prefix, and one prune pass covers both.
   - **`<owner>/<name>`**, like `repos/<owner>/<name>`, so forks and same-named repos never
     collide. The leaf is still the repo's name.

   **Why worktrees.** Worktrees are the standard, and Claude Code and Codex already run worktrees
   of Zach's repos on this Mac every day, sharing `.git` the same way. A Worker's branch is in the
   person's repo from its first commit, so `git branch` and `git log` show it while it works. To
   see or run the Worker's work, the person opens its worktree folder, as with Claude Code. Git
   refuses to check that branch out in the folder while the worktree holds it. This reverses the
   2026-11-21 choice of separate clones.

   **Accepted risk.** A Codex Worker needs the folder's whole `.git` writable, because the
   narrowed roots are what failed in #424 ([specs/workers.md](../../specs/workers.md#run-a-turn)
   step 5). So a Codex Worker can move the person's `main`, delete their branches, or write
   `.git/hooks` and `.git/config` (`core.hooksPath`, `core.fsmonitor`) that then run unsandboxed
   the next time the person runs `git` in their folder. Zach accepts this, for the reason above:
   the Codex and Claude Code worktrees he already runs share `.git` the same way. Claude Code
   Workers already run unsandboxed as the machine user (ADR 0056 decision 7). The "Add folder"
   disclosure names the risk.

   **Other costs.**
   - **Shared refs, config and `gc`.** A Worker's ref, `packed-refs` and config writes land in the
     person's repo, and a `gc` or `git worktree prune` on either side acts on all of them.
   - **Lock contention.** Workers and the person contend for `packed-refs.lock` and
     `config.lock`, so a concurrent git command can fail with a lock error. The Computer's own git
     steps retry a lock error a bounded number of times.
   - **The folder is a dependency.** If the person deletes or moves it, every worktree of it
     breaks, because each worktree's `.git` file points into the folder, and commits that lived
     only on local branches go with it. Haus checks the folder and its `origin` before each launch
     and checkout, refuses with the path when it is gone, shows it as missing on the Computer's
     settings page, and never deletes a broken worktree on its own.
   - **Fetching moves the person's remote-tracking refs**, because the Computer fetches in the
     folder before it branches.

5. **One repo per Worker; Agents check out on request.**
   - `haus worker start --repo <owner/name>` takes one repo, as today, and the flag is required,
     since no Project supplies a default. Several repos per Worker are deferred, because the
     Worker record, `--ref`, the branch and `worker-turn-start`'s checkout each carry one repo.
     `WORKER_REPO_UNKNOWN` goes: a start with no `--repo` is a CLI usage error.
   - An Agent gets a worktree with `haus repo checkout <owner/name> [--ref <ref>]`. It runs on the
     runner and sends a new `repo-checkout` invocation to the Computer its `bash` or `shell` call
     targeted (ADR 0057 decision 5). It works only for a repo that Computer already has a folder
     for. Otherwise it refuses and names the Computer's folders, and the next action is to ask the
     attacher to add one. It never clones with the machine's login.
   - The worktree is on a named branch, `haus/<agent-id>/<name>`, from `--ref` or the remote
     default branch after a fetch, so no cleanup can strand detached commits. One worktree per
     Agent per repo per Computer. A second checkout reuses it. With a different `--ref`, it resets
     the branch to that ref when the worktree is clean, and refuses when it is not. The receipt
     prints the path, and the Agent `cd`s into it.
   - **What an Agent may do there.** Everything a Captain does in Capy: read, edit, build, test,
     commit, push its branch, and open a pull request. Nothing requires handing code to a Worker.
     It does all of this as the Server's Haus GitHub App, never through a personal login on the
     Mac, which its own `HOME` cannot see anyway (ADR 0057 decision 4). It opens pull requests
     through the GitHub connection's MCP tools, which already run as the bot. It pushes over HTTPS
     with an installation token the Server mints for that repo. An installation token reaches
     only the repositories its installation selected, so a repo outside that selection cannot be
     pushed, and the refusal says the App needs access to it.
     (2026-11-23) A token also needs the Agent's grant on the GitHub connection that holds the
     installation, as that connection's MCP tools do, and a folder for the repo on that Computer,
     so the Server's repo list, not every repo the App reaches, bounds what an Agent pushes.
   - **Commit identity.** Haus follows Capy's Commit author setting, with a multiplayer default:
     the Haus bot is the author, and the person who asked is a co-author. A Captain in a shared
     channel works for whoever asked, so it never commits as one person when another person asked.
     - The Computer sets `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and
       `GIT_COMMITTER_EMAIL` to the App's bot account (`<HAUS_GITHUB_APP_SLUG>[bot]` and its
       GitHub noreply address) in the environment of every Agent invocation. `HAUS_GITHUB_APP_SLUG`
       is already configured (`apps/server/src/github/app-auth.ts`).
     - Each commit ends with a `Co-authored-by:` trailer for each person whose message the turn
       is acting on, by the name and email on their Haus account. GitHub links the co-author
       only when that email is on their GitHub account. The Manual teaches the trailer, the way
       Workers are taught the `Haus-Task` trailer.
     - Every Agent branch starts with `haus/`.
     - **"As me"**, the person as author with Haus as co-author, needs a per-person GitHub
       sign-in for pushing, and is a later option.
     - **Workers are unchanged.** They commit and push with the machine's own git login
       ([ADR 0056](0056-agents-run-quiet-workers-anywhere.md) decision 7).

6. **Cleanup.** Work that is not pushed is never deleted. A worktree is clean when it has no
   uncommitted or untracked changes and every commit on its branch is on a remote-tracking ref,
   checked against a fresh fetch. Cleanup of a worktree runs one at a time with its use.
   - **A Worker.** Closing it ([specs/workers.md](../../specs/workers.md#closing)) removes the
     worktree when it is clean and deletes its local branch, which the remote keeps. Otherwise
     the worktree stays with its branch. The final `worker_report` is delivered before the
     Computer cleans up (step 4 before step 5), so it cannot name a kept worktree. Instead the
     Computer's `worker-held` report on each connect names kept worktrees, the Worker card shows
     the path, and the Computer removes a kept worktree once it is clean or gone.
   - **An Agent.** Its worktrees are scratch. The Computer removes a clean one 7 days after it was
     last used: the newest of its last `haus repo checkout`, an edit or file invocation on a path
     inside it, and a change to its git index. Removal keeps the branch, and the receipt says
     when a clean copy goes. A week covers a weekend and on-and-off work. What costs disk is the
     full working tree, with its dependencies and build output, not the shared objects.
   - **Retirement and detaching.** Retiring an Agent (ADR 0057 decision 4) and purging a Server's
     partition remove each clean worktree from its folder and keep its branch. A worktree with
     uncommitted changes stays where it is, and `haus-computer repo list` shows it until the
     person removes it. A purge also keeps the Haus clone backing any worktree it keeps.
   - **Which login a cleanup fetch uses** (2026-11-23). An Agent's worktree is fetched as the Haus
     GitHub App, never the machine's login: the checkout's fetch with the command's own token,
     the 7-day sweep and retirement with a read-only token the Computer asks for. A purge runs
     after the Server is gone, with no App to ask, so it checks an Agent's worktree against the
     remote-tracking refs it already has, which the Agent's own pushes moved. A Worker's worktree
     is fetched with the machine's login, as the Worker pushed with it.

7. **`project_repos` and `project_repo_links` retire.** The migration:
   - makes a `repos` row for each distinct `workers.repository` on a Server, and for the one
     `project_repos` row (tech-ops → merchbase-core). Workers keep their `repository`;
   - migrates no folder, because `project_repo_links` is empty;
   - moves nothing out of `<dataRoot>/repos/`, because no Computer-place Worker has run in
     production. A Computer that holds such a clone re-clones into the Server's partition on next
     use;
   - deletes both tables, `project.addRepo`, `removeRepo`, `linkRepo` and `unlinkRepo`,
     `WORKER_REPO_NOT_LINKED`, `WORKER_REPO_UNKNOWN`, the `repo-unlinked` launch failure, and the
     W3 auto-add.

8. **Cloud Workers keep cloning from GitHub.** For Cursor and Claude cloud Workers the repo list
   only names the repo. They never need a folder.

## Amendment 2026-11-23: worktrees stay on the old Mac

An Agent's Machine can now change
([ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer)).
A worktree lives on the Computer whose folder it came from, under that Computer's data root
(`worktreesRoot` and `worktreePath`, `apps/computer/src/workers/computer/layout.ts:50-58`), so a
Machine change moves none of them.

- **What stays.** Every worktree, its branch, and its uncommitted and unpushed work stay on the
  old Mac. "Change machine" says so before it saves.
- **What carries.** Only what the Agent pushed. On the new Machine it runs `haus repo checkout`
  again, which needs a folder for the repo there (decision 5).
- **Reaching the old ones.** An Agent that keeps access on the old Mac reaches them with a
  per-call `computer` target.
- **Cleanup is unchanged.** Decision 6 still removes a clean one 7 days after its last use, and
  never removes unpushed work.
- **Carrying work across** (Capy's "Continue on", which moves the branch and uncommitted work and
  ends the turn) is deferred.

## Considered and rejected

- **Keeping separate clones and mirroring branches after every turn.** The council's
  recommendation (Opus, with GPT Sol for Codex). `keepBranches` already copies a Worker's
  branches into the folder on close, so running it per turn would show them one turn behind, let
  the person check them out, and keep Codex's narrowed roots. Rejected by Zach: worktrees are the
  standard, and his own Claude Code and Codex worktrees already share `.git` this way.
- **Worktrees for Claude Code and clones for Codex.** Two layouts and two cleanup paths for one
  idea.
- **Worktrees of a Haus-owned bare mirror.** Refs and locks stay apart from the person's folder,
  but so do the Worker's branches, which defeats the point.
- **A per-Project repo list**, as Capy and today's schema have. Production Workers cross Projects
  freely, and any Agent can already reach any Project
  ([specs/projects.md](../../specs/projects.md#what-an-agent-may-do-outside-its-home)), so the
  list is upkeep that narrows nothing.
- **Capy's primary and lazy repos.** Cloning and snapshotting primary repos at boot speeds up a
  fresh cloud VM. A persistent Computer already has the folder.
- **Worktrees inside the repo**, as Claude Code does. They show up in the person's tree, editor and
  watchers, and every repo needs an ignore rule.
- **Detached Agent worktrees**, as Capy does. Retirement or a prune would strand their commits.
- **`haus repo checkout` cloning on demand.** Any channel member could have an Agent clone any
  private repo the machine's login can read, with **Workers can run here** off.
- **Owners and Admins adding folders.** A folder sends Agents and Workers into one person's own
  checkout and `.git`, so that person decides.
- **A registry kept only on the Computer**, like Capy's `workspaces.json`. The Server could not
  show folders in the App or in `haus worker places`, or check who added one.
- **Agents handing every branch to a Worker to push.** A Capy Captain acts as its owner and ships
  its own pull requests. A Worker for every push is ceremony.
- **Agents pushing through the machine's git login.** It is the person on the Mac, and the
  Agent's own `HOME` cannot see it. The bot is the Server's identity, shared by every Agent.
- **The person as author by default**, Capy's default. In a shared channel the person whose Mac
  it is may not be the one who asked, and Haus has no per-person GitHub sign-in for pushing yet.
- **Several repos per Worker now.** Nobody asked for it yet, and it changes the single repo, ref,
  branch and checkout fields from the record to the wire.

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
`WORKER_REPO_UNKNOWN`, `repo-unlinked`, the W3 repo auto-add, the Worker's separate clone, and
Haus clones outside a Server's partition.

Deferred: several repos per Worker; the "As me" commit author, signed commits and a per-PR author
override; a Server-level Repos settings page; base branches per repo; and setup scripts per repo.

Follow-up:

- Rewrite [specs/projects.md](../../specs/projects.md) "Creating a Project", "Settings", "Repos"
  and "Archiving and deleting".
- Rewrite [specs/workers.md](../../specs/workers.md) "The CLI", "Layout", "Run a turn" (step 5's
  Codex roots), "Closing" and "W3 transitional decisions", and the repo column of
  `haus worker places`, which lists each Computer's folders.
- The `repos` and `repo_folders` tables and the migration; `repoClonePath` under the Server
  partition; the GitHub host check before `repositoryOfRemote`; bounded lock retries.
- `haus repo list` and `haus repo checkout`, each with a row in
  `apps/runner/src/haus/command-access.ts`; the `repo-checkout` operation kind in
  `invocationOperationKindSchema` and `invocationTimeoutsMs`
  (`packages/haus-api/src/agent-invocations.ts:11-30`) and its Computer handler; the bot's git
  identity in the Agent invocation environment.
- Agent pushes. Done 2026-11-23: a git credential helper on the Computer
  (`haus-computer __git-credential`) asks the Server for an installation token scoped to the one
  repo, an hour at most, written only to git's pipe. A repo maps to the Server's live
  installation on its owner. A push or private fetch the App cannot reach refuses with "The Haus
  GitHub App needs access to owner/name." The checkout and cleanup fetches use the same contract
  (decision 6). See [specs/github-app-connection.md](../../specs/github-app-connection.md#git-on-a-computer).
- The bot's noreply address. Done 2026-11-23: the Server reads the bot user id from
  `GET /users/<slug>[bot]` once per process, and no new environment variable is needed.
- The `Co-authored-by` trailer in the Manual. Done 2026-11-23: the `repos` topic teaches one
  trailer per person whose message the turn is acting on, and `haus repo co-author @handle…`
  prints them from each Haus account's name and email.
- Pull requests as the bot. Done 2026-11-23: the GitHub connection's MCP tools already ran as the
  bot for an installed owner, and now refuse an owner with no installation instead of falling
  back to the signed-in person's token. Ownerless reads (`get_*`, `list_*`, `search_*`) and MCP
  discovery are the stated exception, as
  [specs/github-app-connection.md](../../specs/github-app-connection.md#agent-identity) says.
- `haus-computer repo add|list|remove`, and the folder list and its "Add folder" disclosure on the
  Computer's settings page.
- The prompt's command families gain a `repo` entry beside `computer`, through the prompt
  contract and the register row "Communication — CLI ONLY, command families". The Manual's
  `workers` topic and a new repos topic teach the rest.
- Update [docs/api/agents.md](../api/agents.md), [docs/api/projects.md](../api/projects.md) and
  [docs/internals/data-model.md](../internals/data-model.md) when this lands.

## Open questions

None. Zach decided that Agents commit, push and open pull requests themselves as the Haus GitHub
App bot, with the person who asked as co-author, and that "As me" comes later. The council settled the draft's other questions: worktrees stay for Claude Code and Codex, with
the Codex risk accepted; close deletes a pushed local branch; the idle period is 7 days from last
use; a repo joins the list only after a successful clone or folder add; and paths end in
`<owner>/<name>`.

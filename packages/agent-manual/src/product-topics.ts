import type { ManualNavigationTopic } from './types.ts';

export const productTopics: readonly ManualNavigationTopic[] = [
    {
        body: `# Amazon product references

Write a standalone uppercase Amazon ASIN such as B07XN9T11R, or a normal https://www.amazon.com/dp/B07XN9T11R link, in message prose. Haus App automatically resolves a product thumbnail and title when this Server has a connected RankWrangler MCP account. Hover or keyboard focus shows a compact card with thumbnail, title, brand, and available price. No special markup or lookup call is needed just to display a reference.

This prototype supports US Amazon product links and ten-character ASINs beginning with B and containing a digit. Code stays code. Other marketplaces, shortened URLs, and Etsy links retain ordinary link behavior. Missing product data leaves the original text readable.

When you need product facts for analysis, use execute to search for RankWrangler and describe rankwrangler_product. Your Agent needs an explicit connection grant to call its tools. Preview rendering does not grant tool access or make the displayed price a live offer.`,
        id: 'amazon-product-references',
        kind: 'overview',
        related: ['haus-cli-overview'],
        summary: 'Mention Amazon ASINs and links as product chips with RankWrangler previews.',
        title: 'Amazon product references',
    },
    {
        body: `# Replies

An inline reply stays in the channel or DM with the message it answers. Send its body on stdin with \`haus message send --target <target> --reply-to <messageId>\`. The parent can be a request or any later reply in that exchange. Received messages identify their parent and original request; use their real message IDs.

Finish with \`--done\`. Add \`--done\` to the message that completes your reply in that chat. People there see you working from when you read their message until that post or the end of your turn. Interim posts (acknowledgments, progress notes, partial results) omit it. Post your answer when it's ready; tidy-up work after it is fine.

**Acknowledge with a reaction.** When a human's message needs no answer (thanks, an ack, "ok", a sign-off), react to it with one emoji and send nothing: \`haus message react --message-id <id> --emoji <emoji>\`. Never react and also send a filler reply. React only to a human's message, never your own or another Agent's. A reaction answers nothing: if the message asks for anything, reply normally.

**Choose the emoji in your own voice.** Match the message's tone: a joke might get 😂, good news 🎉 or 🚀, an agreed plan 👍 or 🤝, gratitude 🙏 or 🫶, a small win 🙌. Vary your choices instead of repeating one. If you have a signature emoji, record it in your memory and use it when it fits, not on every message.

Claiming a request, replying, or being mentioned joins the exchange. Later inline replies reach its participating Agents, including replies a human makes to their own original request. Task completion preserves that participation. A task still has one assignee; other participants can discuss the work without owning it.

Ordinary top-level channel messages continue through the channel inbox. Interpret a standalone mentioned follow-up using the conversation and current task ownership. Human replies before any Agent joins an exchange also use channel delivery. Once the exchange has participants, its ordinary replies reach those participants; an explicit mention can bring another eligible Agent in.

Use \`haus message unfollow --target <target> --message-id <id>\` to leave an exchange, or \`haus message follow\` with the same flags to rejoin. Posting, claiming, or a direct mention restores participation. Channel access remains required.

Explicit task updates record completion. If a later reply requests new work after the earlier task finished, claim that new request. The earlier result and task remain complete. A dedicated thread gives a separate discussion its own place; keep using its existing target when the conversation happens there.`,
        id: 'replies',
        kind: 'overview',
        related: ['haus-cli-overview', 'cloud-agents'],
        summary:
            'Answer inline, acknowledge with a reaction, and control attention for an exchange.',
        title: 'Replies',
    },
    {
        body: `# Tasks

A task is a message with task metadata, not a separate source of truth. Tasks live in the same chat flow as messages, and only top-level channel or DM messages can become tasks. Messages inside threads are discussion context. Tasks are Agent work: only an Agent ever holds one.

**Listing.** \`haus task list\` shows unfinished tasks across your chats, newest activity first; add \`--target\`, \`--mine\`, or \`--status all\` to change the scope.

**Reading task state.** A message already marked as a task reads \`@Alice: Fix the login bug [task #3 status=in_progress]\`; a regular message has no suffix. \`haus message read\` shows messages in their current state, so a message later converted to a task shows the \`[task #N ...]\` suffix.

**Status flow:** \`todo\` → \`in_progress\` → \`in_review\` → \`done\`. Haus adds \`closed\` (reversible) for a task that turns out to be unneeded. The assignee is independent from status: a task can be claimed or unclaimed at any status except \`done\`.

**Claiming.** Claim by task number if the work is already a task, or by message ID if it is a regular message. Claiming is the concurrency lock and moves the task to \`in_progress\`. Repeat the flags to claim several: \`haus task claim --target "#channel" --number 1 --number 2\` or \`haus task claim --target "#channel" --message-id abc12345\`. A batch claim answers per task — claimed, already yours, or refused with the holder or reason — and fails only when nothing was granted; work only the tasks it granted. If a message already shows a \`[task #N ...]\` suffix, claim \`#N\` if it is yours to take; otherwise leave it with its assignee. If you are that lane's canonical owner, correct the routing in the original thread rather than starting conflicting work.

**Finishing.** Set \`in_review\` with \`haus task update\` so a human can validate, then \`done\` after approval (for example "looks good" or "merge it"). A message you claimed and fully finished in the same turn goes straight to \`done\`. Explicit status updates finish your tasks.

**Status is member-level.** Anyone in the task's chat may change its status, holder or not — a reviewer moves another Agent's \`in_review\` task to \`done\` directly. Only these moves are accepted: \`todo\` → \`in_progress\`/\`closed\`; \`in_progress\` → \`in_review\`/\`done\`/\`closed\`; \`in_review\` → \`done\`/\`in_progress\`/\`closed\`; \`done\` → \`todo\`/\`in_progress\`/\`in_review\`/\`closed\`; \`closed\` → \`todo\`/\`in_progress\`. Unassigned work reaches \`in_progress\` only by a claim.

**Assigning.** \`haus task assign --target "#channel" --number <N> --assignee @agent\` hands a task to any Agent member of that chat, even one someone else holds; \`haus task unassign --target "#channel" --number <N>\` clears it. Add \`--expected-revision <n>\` (the \`rev=\` in \`haus task list\`) when you might be acting on a stale view — you lose the race instead of overwriting someone else's assignment. \`assign\` is not \`claim\`:

| | means | assignee | status |
|---|---|---|---|
| \`claim\` / \`unclaim\` | "I am starting / putting down this work" | you | \`claim\` advances \`todo\` → \`in_progress\` |
| \`assign\` / \`unassign\` | "this belongs to X / to nobody" | any Agent in the chat | unchanged |

Handing work to someone never announces they started it; they claim before working. A human, or a handle that does not exist, is retired, or is outside the chat, all answer "not assignable in this chat".

**Handing work to a human.** Humans never hold a task. When you need a person to decide, approve, review, or supply something, @mention them in the task thread with one question, a default only if it is reversible, and what you prepared. The mention notifies them, and their reply there wakes you. Keep the task yours while you wait (see \`recipes/decision/when-to-ask-human\`).

**Creating tasks.** \`haus task create\` is a convenience for one sequence: create a brand-new message, then publish it as a task. It creates an unassigned \`todo\` task by default. \`--assignee @yourself\` atomically creates it \`in_progress\` with a claim timestamp. \`--assignee @peer\` reserves a \`todo\` task for another Agent in that Channel, follows its task thread for them, and wakes them directly even when the Channel is muted. People do the same from the App. The assignee receives an assignment receipt pointing to the canonical task; inspect and claim that task before working. The receipt is not a second task.

The task system exists to prevent duplicate work. Before \`haus task create\`, check whether the work already exists on the task board or is already being handled. If someone already sent the work item as a message, claim that message instead of creating a new one. Use \`haus task create\` only for genuinely new work — breaking a larger task into parallel subtasks, or batch-creating follow-up work for others to claim — that does not already have a canonical task.`,
        id: 'tasks',
        kind: 'overview',
        related: [
            'haus-cli-overview',
            'replies',
            'recipes/technique/task-claim-lock',
            'recipes/decision/when-to-ask-human',
        ],
        summary: 'Claim, finish, create, and assign tasks without duplicating work.',
        title: 'Tasks',
    },
    {
        body: `# Cloud agents

A Cloud Agent is a provider-hosted agent you hand bounded development work to. You start it, it works in a repository without you, and its result reaches your inbox when the run settles.

Use one when the work is a real coding change in a repository someone else's machine can build — reproduce a failure, make the change, open a pull request — and you would otherwise sit and wait. Keep work you can finish in this turn, and anything needing conversation, for yourself.

\`haus cloud-agent start --target <target> --repo <owner/name> --ref <ref> --title <text> --say <text>\`

The instructions for the cloud agent arrive on stdin. Write them as a complete brief: the cloud agent cannot ask you a question, so name the repository paths, the reproduction, and what a finished result looks like. \`--say\` is your own message to the chat and becomes the Message content, so say what you delegated and why in your own words. \`--title\` names the work for humans, and \`--ref\` is the starting branch, tag, or commit.

In a channel or DM, add \`--reply-to <messageId>\` to connect the work card to the request inline. Its implementation thread remains attached to the card.

**Launch approval.** A launch spends provider time on someone's repository. When the Server, the requester, or your brief wants a human to approve launches, @mention that human in the conversation with the repository, starting ref, and a one-line brief, and wait for an explicit yes in reply before \`start\`. Silence, a reaction, or "sounds interesting" is not a yes. There is no approval card; their reply wakes you.

Launch fails before anything is created when the input is wrong, the Computer has no Cloud Agent provider, or the target is unreachable. Once the work is recorded it stays recorded: a provider that refuses the launch settles that same work as failed rather than erasing it.

A top-level work Message gets its thread immediately, and work started inside a thread stays there. The work thread holds implementation details and revisions.

For revisions, corrections, or another step in the same assignment, send instructions on stdin with \`haus cloud-agent send --work <workId>\`. Reuse the Work ID from the start receipt. This continues the same hosted agent and work thread, preserving its repository context and earlier results. If it is busy, Haus queues the prompt. Add \`--interrupt\` when the new instructions replace active work and any older queued prompts. Start another cloud agent only for a separate assignment.

\`haus cloud-agent inspect\` lists work you delegated. Add \`--work <workId>\` to read that work's status and recorded results. Completion reaches your inbox automatically and wakes you, or arrives in a later turn if you are busy. You do not need to set a reminder or poll to learn when it finishes; inspect when you need evidence.

\`haus cloud-agent stop --work <workId>\` asks the provider to stop work you started and discards its queued prompts. Owners and Admins can cancel it too. Cancellation is recorded immediately and the active run settles as cancelled when the provider stops. The earlier \`cancel\` command remains an alias for existing callers. A later \`send\` continues the same work with a new run.

When the run settles you receive one inbox attention carrying its status, summary, branches, and any pull-request URL, and the report names that pull request's number, state, and diff counts when Haus could read them, so you can judge the size of the change before opening it. As the coordinating Agent, bring a concise outcome and a link to the work back to the requester’s conversation, following their lead when they join the work thread.`,
        id: 'cloud-agents',
        kind: 'overview',
        related: ['agent', 'haus-cli-overview', 'recipes/decision/when-to-ask-human'],
        summary:
            'Delegate bounded repository work to a provider-hosted agent and report the result.',
        title: 'Cloud agents',
    },
    {
        body: `# Agents

An Agent is a persistent collaborator with its own identity, private workspace, memory, execution settings, and one ongoing session across the Chats where it participates.

You can create one yourself:

\`haus agent create --target <target> --name <name> --description <text> [--brief <text>] [--channel "#name"] [--avatar-concept <text>] --say <text>\`

Create an Agent only when a human in the Chat you are working in has asked for one. Their request is the whole consent; there is no card to prepare and no approval to wait for. Never create an Agent on your own initiative, and never create one to split work you could do yourself — a new Agent earns its place by owning a lasting lane, not by absorbing one task.

The new Agent inherits your runtime, model, reasoning effort, and Computer, and joins as an ordinary Agent with its own Owner DM and workspace. Haus derives the handle from \`--name\` — lowercased, with spaces as hyphens — so \`--name "Orbit"\` is \`@orbit\`. If that handle was already taken the creation is refused, nothing is created, and the refusal names the handle the Server minted instead; run the same command again with that one.

**Announce it in #all.** Target \`#all\` for the creation unless the human asked for it privately. Your \`--say\` is the team's first impression of the new teammate, so write it like introducing a new hire to the room: warm and specific, not a changelog and not corporate. Name them by \`@handle\` — that mention is how humans reach the profile, and there is no other control on the Message — say what they own in one sentence, add one detail that makes them feel like a person, and say who to ask about the lane. For example: \`Everyone, meet @orbit, our new competitor-intel teammate. Orbit watches launches and pricing moves and drops a weekly digest in #product every Friday. Say hi, and send lane questions to the owner.\` Avoid "please join me in welcoming."

**Put it where the work is.** Pass \`--channel\` for every channel the request names or the lane clearly implies. It always joins \`#all\`, so you never pass that. Do not add it anywhere else on a guess; a channel you named that does not exist refuses the whole creation, and you can adjust membership later with \`haus channel add --target "#name" --agent @handle\`.

**Give it a brief.** \`--brief\` is the standing instruction it reads on every startup: its lane, its outputs, its cadence, where to post, who reviews, and what to ask about before guessing. It is not a message, and you do not DM the new Agent — DMs are between a human and an Agent. Write it every time; an Agent that wakes without one has nothing to own.

When a brief or workspace note names a human or another Agent for later, copy their ID-backed Markdown reference from \`haus server info --humans\` or \`--agents\`. Reuse that link in later messages. A saved plain \`@handle\` can become stale after a rename; a saved \`user://\` or \`agent://\` target still names the same actor. Discover a new person through the directory when needed, not on every send.

\`--avatar-concept\` generates the avatar during creation. If the Server has no avatar generation provisioned, the Agent is created without one and the receipt says so — state that plainly rather than sending the human to Settings; no App setting controls it. A transient generation failure refuses the whole request and creates nothing, so retry once.

The receipt returns the new \`@handle\` and the channels it landed in.

**Re-running it is safe.** The identical command returns the teammate the first run created and creates nothing new; the receipt says it repeated an earlier request. So when a create times out, or you cannot tell whether it landed, run it again exactly as you wrote it rather than checking first. Change any flag — a word in \`--say\`, one more \`--channel\` — and you are asking for a different Agent, and you get a second one.

\`haus agent update --agent @handle --description <text>\` rewrites an Agent's description, and \`haus agent avatar --agent @handle --concept <text>\` replaces its avatar. Cove's identity is protected: both refuse on Cove.

The Agent profile pane in Haus App is where a human owns these values, along with runtime, model, and reasoning effort, which are theirs alone to change. Editing from Chat is a convenience for the human standing in front of you, not the record.`,
        id: 'agent',
        kind: 'overview',
        related: ['haus-cli-overview', 'recipes/decision/when-to-ask-human'],
        summary: 'Create and maintain persistent Agents from the Chat a human asked in.',
        title: 'Agents',
    },
];

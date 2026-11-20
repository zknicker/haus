import type { ManualNavigationTopic } from './types.ts';

export const productTopics: readonly ManualNavigationTopic[] = [
    {
        body: `# Amazon product references

While this Server has RankWrangler connected, a standalone uppercase Amazon ASIN such as B07XN9T11R, or a normal https://www.amazon.com/dp/B07XN9T11R link, in message prose renders as a product chip, and Haus App resolves its thumbnail and title. Without RankWrangler the ASIN stays plain text and the link stays an ordinary link. When you name a product, write its ASIN beside the name so readers get the chip. Hover or keyboard focus shows a compact card with thumbnail, title, brand, and available price. No special markup or lookup call is needed just to display a reference.

This prototype supports US Amazon product links and ten-character ASINs beginning with B and containing a digit. Code stays code. Other marketplaces, shortened URLs, and Etsy links retain ordinary link behavior. Missing product data leaves the original text readable.

When you need product facts for analysis, use execute to search for RankWrangler and describe rankwrangler_product. Your Agent needs an explicit connection grant to call its tools. Preview rendering does not grant tool access or make the displayed price a live offer.`,
        id: 'amazon-product-references',
        kind: 'overview',
        related: ['haus-cli-overview'],
        summary:
            'Amazon ASINs and links become product chips while this Server has RankWrangler connected.',
        title: 'Amazon product references',
    },
    {
        body: `# Images

Use \`haus image generate\` for any image people will see or that needs a specific model. Your runtime's own image tool, when it has one, suits scratch work no one else needs.

**Pick a model.** The list is curated and every model has a real id. \`haus image models\` prints each one's strengths, sizing rules, quality levels, reference limit, transparency support, price estimates, and whether this Server has its key. An unavailable model says why; the Server Owner adds the key at Settings → Models → Image generation.

**Generate.** \`haus image generate --model <id> [--size WxH | --aspect A:B --resolution 1K|2K|4K] [--quality <level>] [--background opaque|transparent] [--reference <attachment id | workspace path>]...\` with the prompt on stdin. One generation is one image. The command starts the generation and returns at once with a \`Link:\` line and the generation id; it does not wait for the image.

**Show it now, keep working.** Right after generate returns, paste the \`Link:\` line as printed into \`haus message send\`; the card shows progress and fills in when the image is ready. Then continue other work. Start several generations back to back and send their links in one message; links back to back render side by side. Each line of links becomes a carousel in that spot, so put a group's links on their own line where the images belong (under the line that names them, not inside a sentence). Generating never posts on its own. Never write the link by hand. Where the image goes follows the human's request.

**Do not wait by default.** Post the link and finish your turn. If a generation fails, you get one Inbox notice naming the model and the reason; a successful one never wakes you. Tell the person and, if it helps, retry with another model. A failure before you have posted the link sends no notice; if it already failed, \`haus message send\` tells you when you post the link.

**Get the file.** Wait only when your next step needs the file: editing it, using it as a reference, or feeding a pipeline. Run \`haus image wait <generation id> [--out <workspace dir>] [--timeout <seconds>]\`. It waits for the result, saves the file in \`generated-images/\` in your workspace, and prints the model, rendered size, quality, duration, and cost. It is safe to run again, and if it times out the generation keeps running; run it again.

**References.** \`--reference\` takes an attachment id or a workspace file, for an edit or a style match. Only models with a reference limit accept it, and going over the limit fails.

**Sizes and options.** A model that cannot render your size, aspect, quality, or transparency exactly fails before anything is billed and names the nearest supported option; pick that, or another model. Nothing is silently adjusted.

The card fills in with the image, its model, and its cost; that is the result. Never attach or re-post the generated image unless someone asks for the file. The saved file is also an ordinary attachment, so when asked you can send it with \`haus message send --attachment-id <id>\`; any other file goes in an attachment or in Drive (see drive). If you cannot make an image, say so plainly instead of describing one you did not make. Diagrams, charts, and figures built from data are visuals, not generated images; read the visuals skill and render them as an inline visual or a page.`,
        id: 'images',
        kind: 'overview',
        related: ['attachment', 'drive', 'message'],
        summary:
            'Generate images with haus image: pick a curated model, then link the result in a message.',
        title: 'Images',
    },
    {
        body: `# Replies

An inline reply stays in the channel or DM with the message it answers. Send its body on stdin with \`haus message send --target <target> --reply-to <messageId>\`. The parent can be a request or any later reply in that exchange. Received messages identify their parent and original request; use their real message IDs.

**What people see.** A channel or DM is what its members read. A channel is a shared space with its own purpose, and its members come to it for that. A side conversation stays there as inline replies; work that outlasts a reply goes in a Task (see tasks). An inline reply stays there, quoted under the message it answers, and notifies the person who wrote that message. In a DM every message notifies the other person. There are no threads: a \`<target>:<shortId>\` target is refused.

So the person waiting on you gets what they asked for where they are looking: an inline reply to their message in a channel or DM, or a post in the Task it arrived in, and nothing they did not ask for. Work your reply will not finish goes in a Task: answer the request with the Task's key, and post progress, questions, and the result in the Task (\`--target task:SEC-12\`), which whoever asked follows. Cloud agents work for a Task and report there (see cloud-agents).

**Finish with \`--done\`.** Add \`--done\` to the message that answers the request where it arrived: an inline reply in a channel or DM, or a post in the Task it arrived in. People there see you working from when you read their message until that post or the end of your turn. Interim posts (your pickup note, a question, or a partial result the human needs now) omit it. Post your answer when it's ready; tidy-up work after it is fine.

**Acknowledge with a reaction.** When a human's message needs no answer (thanks, an ack, "ok", a sign-off), react to it with one emoji and send nothing: \`haus message react --message-id <id> --emoji <emoji>\`. Never react and also send a filler reply. React only to a human's message, never your own or another Agent's. A reaction answers nothing: if the message asks for anything, reply normally.

**Choose the emoji in your own voice.** Match the message's tone: a joke might get 😂, good news 🎉 or 🚀, an agreed plan 👍 or 🤝, gratitude 🙏 or 🫶, a small win 🙌. Vary your choices instead of repeating one. Your signature emoji is your profile's pickup reaction; elsewhere, use it when it fits, not on every message.

Claiming a request, replying, or being mentioned joins the exchange. Later inline replies reach its participating Agents, including replies a human makes to their own original request. Claim completion preserves that participation. A claim still has one assignee; other participants can discuss the work without owning it.

Ordinary top-level channel messages continue through the channel inbox. Interpret a standalone mentioned follow-up using the conversation and current claim ownership. Human replies before any Agent joins an exchange also use channel delivery. Once the exchange has participants, its ordinary replies reach those participants; an explicit mention can bring another eligible Agent in.

Use \`haus message unfollow --target <target> --message-id <id>\` to leave an exchange, or \`haus message follow\` with the same flags to rejoin. Posting, claiming, or a direct mention restores participation. Channel access remains required.

Explicit claim updates record completion. If a later reply requests new work after the earlier claim finished, claim that new request. The earlier result and claim remain complete. When a conversation is already happening in a Task, keep using its existing target.`,
        id: 'replies',
        kind: 'overview',
        related: ['haus-cli-overview', 'tasks', 'cloud-agents'],
        summary:
            'Answer inline, acknowledge with a reaction, and control attention for an exchange.',
        title: 'Replies',
    },
    {
        body: `# Claims

A claim is a message with claim metadata, not a separate source of truth. Claims live in the same chat flow as messages: a channel, DM, or Task message once you claim it. Claims are Agent work: only an Agent ever holds one. A claim is the lock on a message; work that takes longer than a reply also gets a Task (see tasks), and the claim still marks it yours.

**Listing.** \`haus claim list\` shows unfinished claims across your chats, newest activity first; add \`--target\`, \`--mine\`, or \`--status all\` to change the scope.

**Reading claim state.** A message already marked as a claim reads \`@Alice: Fix the login bug [claim #3 status=in_progress]\`; a regular message has no suffix. \`haus message read\` shows messages in their current state, so a message later converted to a claim shows the \`[claim #N ...]\` suffix.

**Status flow:** \`todo\` → \`in_progress\` → \`done\`, with \`in_review\` before \`done\` only when a human must sign off. Haus adds \`closed\` (reversible) for a claim that turns out to be unneeded. The assignee is independent from status: a claim can be claimed or released at any status except \`done\`.

**Claiming.** Claim by claim number if the work is already a claim, or by message ID if it is a regular message. Claiming is the concurrency lock and moves the claim to \`in_progress\`. Repeat the flags to claim several: \`haus claim --target "#channel" --number 1 --number 2\` or \`haus claim --target "#channel" --message-id abc12345\`. A batch claim answers per claim — claimed, already yours, or refused with the holder or reason — and fails only when nothing was granted; work only the claims it granted. If a message already shows a \`[claim #N ...]\` suffix, claim \`#N\` if it is yours to take; otherwise leave it with its assignee. If you are that lane's canonical owner, correct the routing inline where the request arrived rather than starting conflicting work.

**Finishing.** When the work is finished, set it \`done\` yourself with \`haus claim update\`; the conversation is the review. Use \`in_review\` only when the requester asked to sign off on the result, or the work needs a human decision before it counts as finished (such as a risky or irreversible change awaiting confirmation), and say in the conversation what they need to check. Explicit status updates finish your claims.

**Status is member-level.** Anyone in the claim's chat may change its status, holder or not — a reviewer moves another Agent's \`in_review\` claim to \`done\` directly. Only these moves are accepted: \`todo\` → \`in_progress\`/\`closed\`; \`in_progress\` → \`in_review\`/\`done\`/\`closed\`; \`in_review\` → \`done\`/\`in_progress\`/\`closed\`; \`done\` → \`todo\`/\`in_progress\`/\`in_review\`/\`closed\`; \`closed\` → \`todo\`/\`in_progress\`. Unassigned work reaches \`in_progress\` only by a claim.

**Assigning.** \`haus claim assign --target "#channel" --number <N> --assignee @agent\` hands a claim to any Agent member of that chat, even one someone else holds; \`haus claim unassign --target "#channel" --number <N>\` clears it. Add \`--expected-revision <n>\` (the \`rev=\` in \`haus claim list\`) when you might be acting on a stale view — you lose the race instead of overwriting someone else's assignment. \`assign\` is not \`claim\`:

| | means | assignee | status |
|---|---|---|---|
| \`claim\` / \`release\` | "I am starting / putting down this work" | you | \`claim\` advances \`todo\` → \`in_progress\` |
| \`assign\` / \`unassign\` | "this belongs to X / to nobody" | any Agent in the chat | unchanged |

Handing work to someone never announces they started it; they claim before working. A human, or a handle that does not exist, is retired, or is outside the chat, all answer "not assignable in this chat".

**Handing work to a human.** Humans never hold a claim. When you need a person to decide, approve, review, or supply something, @mention them in an inline reply where the request arrived (or in the Task if it arrived there) with one question, a default only if it is reversible, and what you prepared. The mention notifies them, and their reply there wakes you. Keep the claim yours while you wait (see \`recipes/decision/when-to-ask-human\`).

**Creating claims.** \`haus claim create\` is a convenience for one sequence: create a brand-new top-level message, then publish it as a claim. A claim title is the work in plain words: people read the claim message, so it never carries targets, message IDs, or source references. It creates an unassigned \`todo\` claim by default. \`--assignee @yourself\` atomically creates it \`in_progress\` with a claim timestamp. \`--assignee @peer\` reserves a \`todo\` claim for another Agent in that Channel and wakes them directly even when the Channel is muted. People do the same from the App. The assignee receives an assignment receipt pointing to the canonical claim; inspect and claim it before working. The receipt is not a second claim.

The claim system exists to prevent duplicate work. Before \`haus claim create\`, check whether the work already exists in the claim list or is already being handled. If someone already sent the work item as a message, claim that message instead of creating a new one. Use \`haus claim create\` only for genuinely new work inside a conversation, such as a split that stays there, that does not already have a canonical claim. Work split for other Agents, or follow-up work for others to pick up, is a Task: post one message that lists the pieces, start a Task from it for each, and assign them (see tasks).`,
        id: 'claims',
        kind: 'overview',
        related: [
            'haus-cli-overview',
            'replies',
            'recipes/technique/task-claim-lock',
            'recipes/decision/when-to-ask-human',
            'tasks',
        ],
        summary: 'Claim, finish, create, and assign claims without duplicating work.',
        title: 'Claims',
    },
    {
        body: `# Agents

An Agent is a persistent collaborator with its own identity, private workspace, memory, execution settings, and one ongoing session across the Chats where it participates.

You can create one yourself:

\`haus agent create --target <current-chat> --name <name> --description <text> --brief <text> [--channel "#name"] [--avatar-concept <text>] [--emoji <emoji>]\`

Create an Agent only when a human in the Chat you are working in has asked for one. Their request is the whole consent; there is no card to prepare and no approval to wait for. Never create an Agent on your own initiative, and never create one to split work you could do yourself — a new Agent earns its place by owning a lasting lane, not by absorbing one task.

Before creation, read this full topic and \`recipes/decision/one-or-many\` in the current run. Search recipes using the lane's purpose, then fetch the complete relevant archetype. Creation refuses without those full reads and a standing brief; search metadata, summaries, another Agent's reads, and earlier runs do not count. Archetypes are adaptable advice, not a stored Agent type. Choose by the requested work, retrieve applicable handoff or scheduling cards, and record the chosen topic ids in the brief with the lane, exclusions, first deliverable, evidence, destination, reviewer, and escalation conditions. If existing teammates suffice, propose routing to them instead. The Server proves the reads, while you remain responsible for their relevance and a useful brief.

A recurring responsibility needs an actual author-owned reminder, not just a cadence in the brief. After human agreement, ask the new lane owner to retrieve \`recipes/technique/reminder-cron\`, schedule its anchored reminder, and return its id and first fire time. Track that handoff until a receipt or blocker arrives. Persist exact schedule input and use \`haus reminder schedule --command-id <saved-id> --fire-at <saved-time>\` for retry safety; inspect current reminders after restart, update existing schedules for corrections, and cancel on opt-out. Never infer scheduling consent from creation alone.

The new Agent inherits your runtime, model, reasoning effort, and Computer, and joins as an ordinary Agent with its own Owner DM and workspace. The receipt returns the confirmed \`@handle\`, including a suffix if the name was already taken. \`--target\` names the conversation where the human asked; creation posts no message and starts no greeting turn.

**It introduces itself.** On its first turn the new Agent posts one short self-introduction in #haus, in its own voice. Do not post an introduction for it: a second one wakes every Agent in #haus again. Answer the human where they asked, mention the returned \`@handle\`, say what it owns, and name who reviews the lane.

**Put it where the work is.** Pass \`--channel\` for every channel the request names or the lane clearly implies. It always joins \`#haus\`, so you never pass that. Do not add it anywhere else on a guess; a channel you named that does not exist refuses the whole creation, and you can adjust membership later with \`haus channel add --target "#name" --agent @handle\`.

**Give it a brief.** \`--brief\` is the standing instruction it reads on every startup: its lane, its outputs, its cadence, where to post, who reviews, and what to ask about before guessing. It is not a message, and you do not DM the new Agent — DMs are between a human and an Agent. Write it every time; an Agent that wakes without one has nothing to own.

**Keep the description a role line.** \`--description\` is one or two sentences, at most 280 characters, saying what the Agent owns. It closes the new Agent's own instructions and rides every message it sends, so every reader pays for its length. Lane detail, cadence, and context belong in \`--brief\`.

When a brief or workspace note names a human or another Agent for later, copy their ID-backed Markdown reference from \`haus server info --humans\` or \`--agents\`. Reuse that link in later messages. A saved plain \`@handle\` can become stale after a rename; a saved \`user://\` or \`agent://\` target still names the same actor. Discover a new person through the directory when needed, not on every send.

\`--avatar-concept\` generates the avatar during creation. If the Server has no avatar generation provisioned, the Agent is created without one and the receipt says so — state that plainly rather than sending the human to Settings; no App setting controls it. A transient generation failure refuses the whole request and creates nothing, so retry once.

**Pick its signature emoji.** \`--emoji\` sets the reaction it picks up messages with; choose one that fits it, the way you pick its name and description. Leave it off and it uses 👀.

The receipt returns the new \`@handle\` and the channels it landed in.

**Re-running it is safe.** The identical command returns the teammate the first run created and creates nothing new; the receipt says it repeated an earlier request. So when a create times out, or you cannot tell whether it landed, run it again exactly as you wrote it rather than checking first. Change any flag — the brief, one more \`--channel\` — and you are asking for a different Agent, and you get a second one.

\`haus agent update --agent @handle --description <text>\` rewrites an Agent's description, and \`haus agent avatar --agent @handle --concept <text>\` replaces its avatar. Cove's identity is protected: both refuse on Cove.

The Agent profile in Haus App is where a human owns these values, along with runtime, model, and reasoning effort at Captain profile → Runs on, which an Owner or Admin alone changes. Editing from Chat is a convenience for the human standing in front of you, not the record.`,
        id: 'agent',
        kind: 'overview',
        related: ['haus-cli-overview', 'recipes/decision/when-to-ask-human'],
        summary: 'Create and maintain persistent Agents from the Chat a human asked in.',
        title: 'Agents',
    },
];

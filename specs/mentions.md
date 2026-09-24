---
summary: Rich reference model for explicit markdown mentions, chip rendering, agent addressing, and runtime skill projection.
read_when:
  - changing composer @ or $ autocomplete, rich reference rendering, runtime mention projection, transcript mention rendering, or agent addressing
  - adding new rich reference kinds such as skills, plugins, apps, files, directories, agents, chats, pull requests, sessions, memories, or product cards
---

# Rich References

Rich references are typed links in message text. The visible Markdown is the
durable source of truth. Human composer selections are serialized as explicit
typed links. Agent output may use bare `@handle` and `#channel` tokens; the
Server canonicalizes known tokens once at send time before persisting the
message:

```md
[@Haus](agent://agt_primary)
[@Ada Lovelace](user://usr_ada)
[$ui](skill://ui)
[@Computer Use](plugin://computer-use@openai-bundled)
[@Chrome](app://computer-use/com.google.Chrome)
[#product](chat://cht_product)
[mentions.md](/Users/zknicker/.codex/worktrees/1b41/haus/specs/mentions.md)
[#482](pr://github/haus/haus/482)
```

Autocomplete inserts friendly text while editing, then the composer serializes
the selected reference into Markdown. Haus does not persist a parallel
`metadata.haus.mentions` index for user-authored messages. Metadata may carry
local picker or chip appearance while editing, but saved messages must render
and route from content alone.

Human-authored bare mention-looking text remains plain text. Agent-authored bare
`@handle` and `#channel` tokens become immutable typed links at send time when
they resolve to a known Agent, active human Server member, or channel. Human
handles resolve to immutable `user://` links using Server-scoped memberships.
Revoked memberships and humans without handles are excluded. Ambiguous handles
remain plain text, including collisions between an Agent and a human. Retries
resolve against the stored message targets so renamed or reused handles cannot
rebind a previous send. Channel tokens support the full channel-name grammar,
including leading hyphens and underscores. Unknown and protected tokens remain
plain text; protected text includes code spans and Markdown constructs whose
leading sigil is presentation syntax.

## Triggers

- `@` after start-of-input or whitespace opens Agent references for agents in
  the current chat and active human Server members. Human handle text helps
  search; selection serializes the current display name.
- `$` after start-of-input or whitespace opens skill references. Skill options
  use stable `skill://<skill-id>` targets and are scoped to the Agents addressed
  by linked Agent mentions in the current draft. If the draft has no linked
  Agent mentions, skill options are scoped to the current chat or DM's Agent
  participants.
- `#` after start-of-input or whitespace opens channel references for channels
  the member can see in the current Server. Selection serializes the channel
  name as `[#name](chat://<chat-id>)`.
- `/` at the very start of the composer opens commands. Commands are not rich
  references.

## Reference Kinds

| Kind | Target | Projection | Behavior |
| --- | --- | --- | --- |
| `agent` | `agent://<encoded-agent-id>` | `agent-reference` | Channel messages retain ordinary delivery to eligible joined Agents while the linked participant receives durable direct-attention metadata; a mention bypasses that Agent's Channel mute, while a direct Thread mention restores an explicit unfollow and resumes ordinary Thread delivery. Agent DMs address their one Agent participant without a link. |
| `chat` | `chat://<encoded-chat-id>` | `chat-reference` | Visual channel reference. The chip opens the referenced channel by immutable chat id. |
| `user` | `user://<encoded-user-id>` | `user-reference` | Visual human reference only. Resolve the current display name/avatar by immutable user id; unknown or departed humans keep the persisted label. No notification or wake behavior. |
| `skill` | `skill://<encoded-skill-id>` | `skill-activation` | Runtime adds a compact turn hint only if the addressed Agent already has that skill enabled. |
| `plugin` | `plugin://<name>@<marketplace>` | `capability-reference` | Preserve the link. Do not enable, install, connect, or authorize the plugin from the reference alone. |
| `app` | `app://computer-use/<encoded-app-id>` | `capability-reference` | Preserve the link with the selected app label. Computer Use resolves the app when tools are invoked. |
| `file` | absolute file path | `path-reference` | Preserve the path. Do not attach file contents automatically. |
| `directory` | absolute directory path | `path-reference` | Preserve the path. Do not recursively attach contents automatically. |
| `pull-request` | `pr://github/<owner>/<repo>/<number>` | `visual reference` | Visual reference to a GitHub pull request, also recognized from a pasted `https://github.com/<owner>/<repo>/pull/<n>` link. Owner, repository, and number come from the target; v1 stores no GitHub state. No notification or wake behavior. |

Images can still travel through attachment/image-input paths, but image
attachments are not part of this typed-link contract.

## Rendering

The Amazon prototype recognizes bare uppercase ASINs and US Amazon product URLs
in rendered prose without rewriting stored Markdown. This presentation-only
exception needs no typed target migration: the ASIN plus US marketplace defines
the identity. RankWrangler connection state gates enrichment, Server membership
authorizes preview reads, and Agent MCP grants independently govern tool use.
See [Rich References](../docs/features/rich-references.md#amazon-prototype).

Haus renders recognized links as compact chips in the composer, transcript,
prompt inspector, and other message surfaces. Rendering is presentation only:
the markdown remains readable without Haus.

Known skills, plugins, apps, and agents may receive richer icons or labels from
their kind and target. Transcript rendering reconstructs chips by parsing the
message content, not by reading message metadata.

All surfaces render one shared reference chip component built on HeroUI
`Chip`. HeroUI owns the shell's shape, spacing, size, and label structure. The
kind registry owns icons, labels, colors, and fallbacks so new reference types
do not add conditionals to chat renderers or introduce another chip primitive.
References use the transparent tertiary shell, inherit the surrounding text's
size, and carry an 18px identity mark—16px for the compact three-sparkle Skill
mark—plus a bold label with a dotted underline in the reference's identity
color. Their internal line box stays tight so the paragraph alone owns leading.
They add no outer padding; the message's ordinary spaces own paragraph rhythm,
and one theme spacing step separates the identity mark from the label. The
fixed-size mark is optically raised by 1.5px. The label reserves underline space inside its own box so
truncation cannot clip the treatment; its dot size and spacing scale with the
surrounding type. Agent labels use the accent (blue) foreground, Skill
labels use a dedicated purple identity color, and chat labels use the Channel's
configured color.
The reference shell has no background. A Channel identity mark retains the
Channel's own colored box.
Agent chips show the Agent's avatar; transcript surfaces resolve it live from
the Agent record by decoding the `agent://...` target. Their label likewise
uses the live Agent display name, with the persisted Markdown label as fallback. The composer
embeds the same appearance in local option metadata at pick time because
composer chips mount outside app providers. An Agent with no uploaded avatar
shows its initials; unknown Agents fall back to the generic Agent icon.

Agent, Chat, and Skill references in transcript/read surfaces are focusable
preview controls; composer references remain inert editor nodes. Hover and focus
use non-interactive HeroUI Tooltips with immediate open and close. Their bottom-left
corner follows fine mouse pointers at +15px horizontally and -15px vertically,
clamped inside the viewport. Leaving the trigger closes the preview immediately.
Keyboard focus retains ordinary anchored placement. Reduced motion disables
decorative product animation while preserving direct pointer positioning. Agent previews resolve the
current Agent record and newest persisted activity lazily while open; Chat and
Skill previews share one compact identity header — mark, title, and one muted
`·` clause — and size to their content up to a shared maximum measure. A Chat
preview's clause is its last activity, and its participant faces render below as
a ringed overlapping stack; a Skill preview's clause is its kind, above its
current description. The reference content
strengthens slightly on hover and focus, deepening in the light theme and
brightening in the dark theme.

Settled transcript content renders through HeroUI Markdown. Typed Haus links
are projected into reference chips without changing the stored Markdown. Agent
and chat chips are interactive: Agent chips open the Agent profile, and chat
chips open the referenced channel.
Ordinary web links use the same chip shell with the site's favicon and a globe
fallback.

## Autocomplete Options

Autocomplete options use one common shape:

- `kind`: reference kind.
- `label`: user-facing chip label.
- `id`: markdown link target.
- `insertText`: editable text inserted before serialization.
- `projection`: runtime projection.
- `metadata`: optional local presentation facts such as app icon data or agent
  face data.

Examples:

| Source | Option identity | Serialized markdown |
| --- | --- | --- |
| Agent | `kind: "agent"`, `id: "agent://agt_primary"`, `insertText: "@Haus"` | `[@Haus](agent://agt_primary)` |
| Human | `kind: "user"`, `id: "user://usr_ada"`, `insertText: "@Ada Lovelace"` | `[@Ada Lovelace](user://usr_ada)` |
| Skill | `kind: "skill"`, `id: "skill://ui"`, `insertText: "ui"` | `[$ui](skill://ui)` |
| Plugin | `kind: "plugin"`, `id: "plugin://computer-use@openai-bundled"`, `insertText: "Computer Use"` | `[@Computer Use](plugin://computer-use@openai-bundled)` |
| App | `kind: "app"`, `id: "app://computer-use/net.imput.helium"`, `insertText: "Helium"` | `[@Helium](app://computer-use/net.imput.helium)` |
| File | `kind: "file"`, `id: "/repo/specs/mentions.md"`, `insertText: "specs/mentions.md"` | `[specs/mentions.md](/repo/specs/mentions.md)` |

## Runtime Behavior

Runtime projection parses the content with Haus's shared rich-reference
parser:

- Agent references decode `agent://...` targets and are validated against the
  current chat's agent participants before turn startup.
- Skill references decode `skill://...` targets and intersect them with the
  addressed Agent's `enabledSkillIds`. They do not grant the skill, mutate
  `enabledSkillIds`, or read linked files from message text.
- Referenced enabled skills are projected as a compact activation hint:

```xml
<skill_reference_context>
The user explicitly referenced these enabled skills for this turn. Use the normal runtime skill-loading mechanism for them:

- ui
</skill_reference_context>
```

- Runtime still loads assigned skill instructions through HarnessAgent's
  `skills` setting during turn startup. It does not inline `SKILL.md` content
  into the user message or system instructions for a skill reference.
- If the addressed Agent does not have a referenced skill enabled, Runtime adds
  no hidden warning or prompt context for that reference.
- Composer skill filtering is advisory. If the user removes a linked Agent
  mention after inserting a skill reference, the skill reference remains valid
  markdown and Runtime silently ignores it for addressed Agents that do not have
  that skill enabled.
- Capability and path references remain visible markdown in the prompt.
- Unknown markdown links render as normal markdown, not chips. Unknown or
  protected bare Agent and channel tokens remain normal text.

## Future Reference Types

New rich references should follow the same rules:

- Require explicit typed syntax at the durable boundary. A narrowly defined
  Agent send path may accept bare `@handle` and `#channel` input only when it
  canonicalizes each known token before persistence.
- Use a durable, typed target.
- Keep message content readable without Haus.
- Do not rely on persisted mention metadata for identity.
- Add parser, rendering, routing, and projection tests before exposing the
  reference in autocomplete or Agent output.

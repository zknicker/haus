---
summary: Draft contract for Haus image generation — a Server-owned, curated multi-provider image capability Agents reach through `haus image`, where each generation is one image and one standalone record that Messages link to and render as a card.
read_when:
  - adding or changing `haus image models` or `haus image generate`, the curated image model registry, or an image provider adapter
  - changing image generation records, their links to Messages, image cards, cost reporting, or the `imageGeneration.onUpdated` event
  - changing how generated images reach attachments or an Agent's workspace
  - deciding between Haus image generation, avatar generation, and execution-runtime-native image tools
---

# Image Generation

Status: **Accepted, landed** ([ADR 0047](../docs/adr/0047-agents-generate-images-through-haus.md)).
The Server adapters, `haus image models`, `generate`, and `wait`, provider-key Settings, and the
App image cards have shipped; what remains is listed under [Follow-ups](#follow-ups).

Image generation gives every Haus Agent, on every execution runtime, one first-class way to render
images: `haus image`. The Server owns the providers, the keys, and a short curated model list. One
image generation is one image and one durable record, individually addressable as
`image-generation://<id>`, linked from Messages the way Cloud Agent work is
([ADR 0044](../docs/adr/0044-cloud-agent-work-is-referenced-not-embedded.md)). Every finished image
is an ordinary attachment and a file in the requesting Agent's workspace.

## Why

Today only Codex (on qualifying ChatGPT plans) and Grok Build can make images, and neither exposes
model, exact size, or cost. Claude Code and Pi Agents cannot make images at all except through
Computer Secrets and hand-rolled scripts. Agent workloads vary (illustrations, product art,
diagrams, edits from references), and all of them need a real model id, an exact size, a file on
disk, and a cost on every image.

## Product contract

- **Agent CLI verbs.** `haus image models`, `haus image generate`, and `haus image wait` are the Agent surface, not a
  harness tool, because the Agent CLI is an Agent's only output channel
  ([ADR 0014](../docs/adr/0014-cli-is-the-agents-only-output-channel.md)). Every execution runtime
  may call them.
- **Server owns providers; the Owner owns the keys.** Provider adapters live on Haus Server and
  use the Server Owner's own API keys, pasted in Settings (see
  [Provider keys and Settings](#provider-keys-and-settings)). Keys never reach Haus App, Computer,
  or an Agent workspace. Computer Secrets (`haus-secrets`) remain an escape hatch for unusual
  providers, not the path.
- **Curated registry.** The Server holds one model per job per provider and no superseded models.
  Adding or removing a model is a Server change only; Computer, App, and the CLI read the registry.
- **One generation, one image.** There is no count, batch, or retry. An Agent that wants four images
  makes four generations, concurrently if it likes; trying another model is another generation.
- **No silent coercion.** A request the chosen model cannot render exactly fails before any
  provider call, naming the nearest supported option.
- **No draft-then-finalize and no upscale in v1.** On both providers a higher resolution or quality
  is a new render with a different composition, so resolution and quality are plain options. An
  upscale is possibly a later, separate command.
- **Every image shows its model and cost.** The card, the lightbox, the CLI result, and the
  Activity step all carry them.

## Model registry

| Model id | Display name | Provider | Job |
| --- | --- | --- | --- |
| `gemini-nano-banana-2.1` | Nano Banana 2.1 | Gemini | **Default.** Everyday renders. `1K` / `2K` / `4K` at about $0.034 / $0.050 / $0.113 per image. |
| `gemini-3-pro-image` | Nano Banana Pro | Gemini | Hard spelling and complex layouts. About $0.134 at `1K`/`2K`, $0.24 at `4K`. |
| `gpt-image-2.5-flare` | GPT Image 2.5 Flare | OpenAI | Fast everyday renders. |
| `gpt-image-2.5-sunburst` | GPT Image 2.5 Sunburst | OpenAI | Best text and edit fidelity. |

Excluded: `gpt-image-2` (about 4× the cost and slower; it stays the avatar service's model, which
this spec does not change), `gemini-3.1-flash-image` (superseded by 2.1), and flash-lite variants.

`haus image models` prints, per model: id, display name, provider, strengths, size grammar (exact
pixels or aspect plus resolution) with the supported values, quality levels, reference-image limit,
transparent-background support, a price estimate per supported resolution and quality, and whether
the model is available on this Server (its key is configured). Prices are registry estimates,
labeled as such.

## Provider keys and Settings

Haus ships no image-generation keys. The Server Owner adds their own OpenAI and Gemini API keys in
Settings, in an Owner-only **Image generation** section.

- **Storage.** One key per provider per Haus Server (`image_generation_keys`, primary key
  `(server_id, provider)`), stored the way the MCP X preset stores its bearer token: a Server-only
  JSONB secret row (`mcp_secrets` precedent), no application-level encryption, never joined into a
  read model. Removing a key deletes the row.
- **No deployment keys.** Image generation never reads Server environment. The existing
  `HAUS_OPENAI_API_KEY` (avatars, GPT-Live) and `HAUS_GEMINI_API_KEY` (thought summaries) are
  unchanged and unrelated.
- **Keys never leave the Server.** No API returns a key. Reads return per provider only
  `{ provider, connected, updatedAt, models }`; there is no last-4 hint (the X precedent shows none).
- **Settings page.** Per provider: connected or not, and the curated models that key unlocks, each
  with display name, what it is good at, and rough price. Add, replace, and remove key live in a
  menu. The model list is curated and read-only: no refresh from provider APIs and no per-model
  toggles in v1.
- **No key, no models.** A provider with no key has its models listed as unavailable by
  `haus image models`, with reason `no-key`, and `generate` against one fails before any record is
  created with that reason, naming Settings → Image generation.
- **Contract.** `imageGenerationSettingsSchema` (list), `imageGenerationKeySetInputSchema`,
  `imageGenerationKeyRemoveInputSchema` in `packages/haus-api/src/image-generation-settings.ts`.
  Only the Server Owner may call them.

### Sizes

- **OpenAI** takes exact pixels: both edges multiples of 16, ratio between 1:3 and 3:1, longest
  edge at most 3840, total pixels between 655,360 and 8,294,400. Above 2560×1440 total pixels the
  provider calls the output experimental; `models` says so. Quality levels are `low`, `medium`,
  `high`, `xhigh`, `max`, and `auto` (the default). `xhigh` and `max` have no registry price row, so
  their estimate uses the `high` row; the recorded cost still comes from reported usage.
- **Gemini** takes an aspect plus a resolution (`1K`, `2K`, `4K`). Aspects: 1:1, 3:2, 2:3, 3:4,
  4:3, 4:5, 5:4, 9:16, 16:9, 21:9; `gemini-nano-banana-2.1` adds 1:4, 4:1, 1:8, 8:1.

`--aspect` plus `--resolution` on an OpenAI model maps only when the mapping is exact; otherwise it
fails and names the nearest supported option. `--size WxH` is always rejected on a Gemini model
with an `IMAGE_GENERATION_INVALID` error naming the nearest `--aspect A:B --resolution NK`; Gemini
sizes are never derived from pixels. A Gemini aspect not in the list names the two nearest (7:5
names 4:3 and 3:2). The result always reports the actual rendered pixel size read from the returned
bytes. Its resolution class (`1K`, `2K`, `4K`) is the requested `--resolution` on Gemini (21:9 at
`1K` renders 1584×672) and the rendered long edge on OpenAI; the cost estimate follows it.

## `haus image generate`

```
haus image generate --model <id> [--size WxH | --aspect A:B --resolution 1K|2K|4K]
  [--quality <level>] [--background opaque|transparent]
  [--reference <attachment id | workspace path>]...
  < prompt on stdin
```

- `--model` is required and is a real registry id. There is no provider alias.
- `--background transparent` fails on a model that cannot render transparency.
- `--reference` makes the request an edit or a style match. Only models with a reference limit
  accept it (Flare and Sunburst take up to 16, the Nano Banana models up to 14); over the limit fails. A workspace path is
  uploaded as an ordinary attachment first, so the record only ever names attachment ids.
- Generation is background work, not a chat action. The command takes no target and never posts:
  it belongs to no Chat or Message, and the Agent mentions it wherever and whenever it chooses.
- The command is asynchronous: it creates the record and returns at once, with no polling. It
  prints a start line (model display name and generation id), the `Link:` line, and a hint:
  "Nothing was posted. Include this Link line in a haus message send now; the card shows progress
  and updates when the image is ready. Only run haus image wait <id> if your next step needs the
  file; you'll get an Inbox notice if the generation fails." The Agent
  shows the image by putting that link in any Message it sends through `haus message send`, right
  away, then keeps working; the card renders at the link and updates live. Several generations
  can be started back to back and their links sent in one Message; they render side by side.
- The receipt names no Chat; placement follows the human request. The `images` Manual topic
  carries the full mechanics; the system prompt adds nothing.
- `generate` writes no file. The workspace file is written by `wait`.

## `haus image wait`

```
haus image wait <generation id> [--out <workspace dir>] [--timeout <seconds>]
```

- Polls the generation until it is `ready` or `failed` (default timeout 5 minutes).
- On ready it downloads the attachment and writes it to `--out` (default `generated-images/` in the
  Agent's workspace, `<UTC yyyymmdd-hhmmss>-<generation id>.<ext>`), then prints state, workspace
  path, attachment id, model, rendered size, quality, duration, and cost. The receipt ends with:
  "The linked card already shows this image. Do not attach or re-send it unless someone asks for the
  file." so the Agent does not post the image a second time.
- It is re-runnable: each run fetches and writes the file again, so a dropped CLI never strands a
  paid image. On failure it prints the reason and exits non-zero. On timeout it exits non-zero with
  a next action to run `wait` again; the generation keeps running on the Server.

## Failure notice

An Agent does not wait for a generation by default: it posts the link, finishes its turn, and
`wait` is only for a next step that needs the file (checking, editing, references, pipelines). So a
generation that reaches `failed` (a provider error, an invalid request found at run time, or boot
recovery's `server-restarted`) sends its requesting Agent exactly one inbox notice. A successful
generation never enqueues anything and never wakes the Agent.

- The notice is an `agent_inbox` row with source `image_generation_failed` (concrete and bodiless,
  like `trigger_problem`, and automation-authored for the chain ceiling). Its dedupe key is
  `image-generation-failed:<generation id>`, so no generation notifies twice.
- It lands in the Chat of the earliest live Message that links the generation, where people saw
  the card fail. It is committed in its own transaction right after the failure settles, then the
  Agent is woken.
- **Unlinked failures send nothing.** `agent_inbox.chat_id` is null only for a `dream`, and every
  inbox lane, target, and trigger projection assumes a Chat for everything else. A chatless notice
  would mean a new lane across schema, target rendering, and turn triggers. The Agent that never
  posted the link is either running `wait` (which prints the failure) or nobody saw a card. A
  failure that lands in the instant before the link posts is also silent; the card still shows it.
- **Send-time tell.** A fast failure can beat the link, so the `POST /api/agent/messages/send`
  `sent` receipt carries optional `failedImageGenerations` (`id`, `modelDisplayName`, `reason`) for
  every generation the sent Message links that is already `failed`. `haus message send` prints one
  line each after the normal receipt: `Image generation <id> (<model>) already failed: <reason>.
  Tell the person; retry with haus image generate if useful.`
- Text (event input, not system prompt):

```
⚠️ Image generation failed: <model display name>
[Generated image](image-generation://<id>)
Reason: <failure reason>
Next: tell the person it failed; if a retry would help, run haus image generate with another model.
```

## Durable image generation

Server stores one `ImageGeneration` record per generation. Like Cloud Agent work it belongs to no
Message or Chat: Messages link to it with `image-generation://<id>`, and the Server projects linked
generations onto the Message read.

```ts
type ImageGeneration = {
    id: string; // `img_…`
    agentId: string; // the requesting Agent
    computerId: string; // historical pointer, no cascade
    model: string; // registry id at request time
    modelDisplayName: string; // registry display name at request time
    provider: 'openai' | 'gemini';
    prompt: string;
    request: {
        aspectRatio: { width: number; height: number }; // derived from size or aspect
        size: { width: number; height: number } | null;
        aspect: string | null;
        resolution: '1K' | '2K' | '4K' | null;
        quality: string | null;
        background: 'opaque' | 'transparent';
        referenceAttachmentIds: string[];
    };
    result: ImageGenerationResult;
    createdAt: string;
    updatedAt: string;
};

type ImageGenerationResult =
    | { state: 'pending' | 'generating' }
    | {
          state: 'ready';
          attachmentId: string;
          width: number;
          height: number;
          resolution: '1K' | '2K' | '4K';
          durationMs: number;
          cost: { usd: number; basis: 'usage' | 'estimate' };
      }
    | {
          state: 'failed';
          reason: string;
          errorCode: string;
          durationMs: number | null;
          cost: { usd: number; basis: 'usage' | 'estimate' } | null; // set when the provider billed it
      };
```

Agent transport mirrors Cloud Agent: the Computer CLI calls Server's runner-authenticated
`GET /api/agent/image-generation/models`, `POST /api/agent/image-generation` (create; returns the
record and `Link`), and `GET /api/agent/image-generation?generationId=` (the CLI polls until
`ready` or `failed`).

The state machine is `pending → generating → ready | failed`. Cost is computed from the provider's
reported usage and the registry's price table when usage is present (`basis: 'usage'`), otherwise
the registry estimate (`basis: 'estimate'`). Surfaces label an estimate. A failed generation the
provider still billed carries its cost; otherwise `cost` is null.

A ready image is an ordinary attachment owned by the requesting Agent: it can be sent again with
`--attachment-id`, viewed with `haus attachment view`, and used as a later `--reference`. Messages
stay append-only, so a ready image is never added to an existing Message's `attachments`; the
linking Message shows it through the projection instead.

**Links and visibility** follow ADR 0044 exactly: an `image_generation_links` row per
`(Message, generation)` with its ordinal, written in the Message's insert transaction; a link
survives only when the author can already see the generation; anyone who can read a linking
Message can see the generation; the requesting Agent always sees its own.

**Prompt and reference handling.** The prompt is stored on the record because the lightbox and the
Agent's QC both need it. Reference bytes stay attachments; provider responses beyond the image
bytes, usage, and an error summary are not stored.

## Cards

Each linked generation renders as one card at the link's position in the Message: the image with
its caption attached in the card footer as one unit. The card is the chat media tile box (the
attachment tile's fixed size) in every state, alone or in a strip, so it never reflows when it
resolves. The image crops to the tile (`object-cover`); the viewer shows the whole picture.

- **Pending or generating**: a shimmering tile; the footer shows the model display name and elapsed
  time. OpenAI `partial_images` may progressively preview it; this is optional.
- **Ready**: the image; the footer shows display name, resolution, and cost, for example
  `GPT Image 2.5 Sunburst · 2K · $0.11` (`~` before an estimated cost). The lightbox adds the
  prompt, rendered size, quality, and duration.
- **Failed**: the pending tile's surface with a soft danger "Failed" chip and the prompt as a
  fading muted ghost. The footer shows the model display name and "Didn't render" (plus the cost
  when billed); the failure reason is in the tooltip and accessible name.

The carousel is presentation only. The App places cards line by line: a line made only of
recorded generation links becomes a strip of cards in its place; links that end a line ("Left to
right: [img] [img]") leave the line's text and become a strip right below it; a link inside a
sentence keeps its chip and its card follows that paragraph. Strips with only blank lines between
them merge, so consecutive links render side by side in one horizontal strip; a single link renders
a single card. A recorded generation whose link the text does not carry follows the last segment.

Motion is quiet and one-time: a card for a running job fades up a few pixels on arrival, a strip's
cards following each other in a short stagger; history renders settled. One shimmer spans pending,
generating, and the decode after ready, and the finished image crossfades over it. Live footers
tick together on one shared second clock. Reduced motion keeps short fades only.
There is no aggregate total or summary. Web, desktop, and iOS render the same cards from the same
projection. An older client renders the Message `content`, links included.

## Realtime

`imageGeneration.onUpdated` is one focused subscription
(`imageGenerationUpdatedEventSchema`, `packages/haus-api`). It carries `serverId`, `chatId`,
`parentChatId`, `messageId`, and `generationId`, once per linking Message in a live Chat, on every
generation state change and new link. The App invalidates that Message's `chat.message` entry.
Events notify; React Query owns state, mirroring `cloudAgentWork.onUpdated`.

## Activity

Each `haus image generate` call is an `image` step, `Started · <model display name>`, and each
`haus image wait` call is an `image` step, `Generated · <model display name>` (or a failed
label), with cost and the saved workspace file on the row (`turn-trace-haus-image.ts`). Codex's
native `image_gen` and `image_edit` steps render as today.

Activity currently derives these steps by parsing the CLI's printed output. A typed generation
reference from Computer, so Activity can show the generation's card, is a follow-up.

## Execution-runtime-native images

Codex's built-in image tool stays allowed: it bills the operator's ChatGPT plan at no marginal
cost. `haus image` is the standard path and the one the `images` Manual topic teaches first.
Native outputs keep flowing through `generated-images/` and `haus attachment upload` as today, and
carry no Haus model or cost. The `images` Manual topic draws the line in one sentence: use
`haus image` for any image people will see or that needs a specific model; the native tool suits
scratch work no one else needs.

## Decided for v1

- **Spend.** Report cost on every generation; no cap, budget, or `--max-cost` guard.
- **No batch APIs.** The providers' half-price batch endpoints settle in hours, which the waiting
  CLI does not model.
- **Model required.** No provider-only or tier aliases.
- **Edits through references only.** Masks and inpainting are out.
- **Failed generations are kept** like ready ones; a provider-billed failure records its cost.
- **A rejected key uses the fixed auth reason**, never provider text: HTTP 401/403 on either
  provider, and Gemini's HTTP 400 `INVALID_ARGUMENT` whose `error.details[].reason` is
  `API_KEY_INVALID`.
- **No concurrency limit.** Provider rate limits fail the generation with the provider's reason.

## Open questions

- **Codex-native images as generations.** Computer already sees native outputs land in
  `generated-images/`. It could record each as a generation (model "Codex built-in", cost covered by
  the plan) so native and `haus image` images share one card. Worth it only if Codex Agents
  visibly mix the two paths.

## Follow-ups

- iOS currently renders the generation link as text. Image cards on iOS are a follow-up.
- Activity derives image steps from CLI output; a typed generation reference from Computer replaces it.
- Remaining from the implementation: the `images` Manual topic. (`CONTEXT.md`, rich references,
  the realtime subscription table, tool presentation, and the data model are done.)
- Deferred: Cloud Agent `start` still posts a launch Message. Moving it to the same
  background-then-link model is a separate change, blocked on where completion notices go once
  the work has no requesting Chat.

---
status: accepted
summary: Agents generate images through `haus image`, a Server-owned curated multi-provider capability on the Server Owner's own provider keys; each generation is one standalone record that Messages link to (extending ADR 0044), started detached from any Chat; avatar generation and runtime-native image tools are unchanged.
read_when:
  - adding or changing `haus image`, the curated image model registry, or an image provider adapter
  - changing image generation records, their links to Messages, image cards, or provider keys in Settings
  - deciding between Haus image generation, avatar generation, and execution-runtime-native image tools
---

# ADR 0047: Agents generate images through Haus

## Status

Accepted, 2026-10-13. Supersedes the "Haus has no general image generator" paragraph in
[Agents](../features/agents.md). Narrows [ADR 0024](0024-agents-prepare-actions-and-avatar-generation-is-composable.md):
runtime-native generation is no longer the only general Agent image path. Avatar generation is
unchanged. Extends [ADR 0044](0044-cloud-agent-work-is-referenced-not-embedded.md). The contract is
[Image generation](../../specs/image-generation.md).

## Context

Only Codex (on qualifying ChatGPT plans) and Grok Build can make images, and neither exposes a model,
an exact size, or a cost. Claude Code and Pi Agents cannot make images except through hand-rolled
scripts over Computer Secrets. Agent work needs a real model id, an exact size, a file on disk, and
a cost on every image.

## Decision

**`haus image` is the Agent surface.** `haus image models` and `haus image generate` work on every
execution runtime, because the Agent CLI is an Agent's only output channel (ADR 0014).

**The Server owns a curated registry and the providers.** One model per job per provider, no
superseded models, OpenAI and Gemini adapters on Haus Server. Adding a model is a Server change.

**Each generation is one image and one record.** Like Cloud Agent work, an `ImageGeneration`
belongs to no Message or Chat; Messages link to it with `image-generation://<id>` and the Server
projects linked generations onto the Message read. Links, visibility, and live updates follow
ADR 0044.

**Generation is detached from any Chat.** `haus image generate` never posts. It prints a `Link:`
line as soon as the record exists and returns without waiting. The Agent shows the image by putting
the link in any Message it sends; the card updates in place. `haus image wait` writes the file into
the Agent's workspace only when the Agent needs it. Success never wakes the Agent; a failure on a
linked generation sends one Inbox notice.

**The Server Owner supplies the provider keys.** The Owner pastes their own OpenAI and Gemini API
keys in Settings, an Owner-only Image generation section. The Server stores each as a per-Server,
per-provider secret the way it stores the X bearer token, and no API returns one. Haus ships no
image-generation keys, and deployment environment keys are not used. A model whose provider has no
key is listed as unavailable and requests for it fail with that reason.

**Runtime-native image tools stay.** Codex's built-in tool still bills the operator's plan and
remains allowed; `haus image` is the standard path for images people will see or that need a specific
model.

## Consequences

- Image cost is visible on every card, the CLI result, and the Activity step.
- Image generation spends the Owner's provider account; there is no cap in v1.
- A migration adds `image_generations`, `image_generation_links`, and `image_generation_keys`.
- Docs move to the new model with the implementation: `CONTEXT.md`, `docs/features/rich-references.md`,
  `specs/realtime-events.md`, the `images` Manual topic, and `docs/internals/tool-presentation.md`.

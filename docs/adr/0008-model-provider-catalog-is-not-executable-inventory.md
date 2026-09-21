---
summary: Decision to separate addable model providers from enabled providers, provider access, and executable model inventory.
read_when:
  - changing model provider setup, add-provider flows, model inventory, or Agent model defaulting
  - changing Runtime model capabilities or model access contracts
---

# ADR 0008: Model Provider Catalog Is Not Executable Inventory

## Status

Accepted.

## Context

Haus separates the maintained provider catalog from the Runtime's enabled providers and executable
models. The provider catalog lists what Haus can add; enabled providers are the user's Runtime
choices; executable models are the model records available for agent turns after provider access is
ready. This keeps Settings -> Models useful for setup without polluting agent model pickers with
every provider Haus may support.

## Current Computer inventory

Haus Computer reports installed execution runtimes and a maintained model list from
`apps/computer/src/inventory.ts`. Each model carries its selectable `reasoningEfforts` and concrete
`defaultReasoningEffort`. These are Haus's explicit settings, not inferred native CLI defaults.
Server validates Agent configuration against the assigned Computer's report, and App consumes
that same report for creation and Setup. AI SDK's installed harness adapters define accepted
runtime settings but do not expose per-model capability discovery. New model entries therefore
need their native capability checked before joining the inventory.

The provider-setup terminology below describes the earlier local Runtime architecture.

## Original decision

Runtime exposes a provider catalog for add-provider flows, an enabled provider list for configured
user choices, provider access state for credentials and host setup, and `/models` for executable
model inventory.

Agent defaulting uses executable model inventory only. If a saved model is invalid, unavailable, or
unset, Runtime repairs or sets it to the highest-ranked executable model. If no executable model
exists, the app remains navigable and prompts provider setup.

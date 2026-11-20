---
summary: Decision to carry all rendering and design guidance in one seeded visuals skill, leaving the system prompt a three-line pointer.
read_when:
  - changing the visuals skill or fence guidance
  - changing the agent system prompt's Visuals section or prompt budgets
  - tuning generated-visual quality or running the design battery
---

# ADR 0012: Design Guidance Is Skill-Carried

## Status

Accepted (PRD-86). Builds on [ADR 0010](0010-widgets-use-tagged-fences.md);
fence grammar and rendering contracts are unchanged.

Amended 2026-07-20: the closed widget catalog (tables, charts, calendars,
html-preview, plugin widgets) is retired. Agents render only `visual` and
`artifact` fences; the skill no longer teaches catalog signatures, and
stored catalog widgets replay as fallback cards
([widgets.md](../internals/widgets.md)).

## Context

After PRD-80/81, the composed system prompt carried a Visuals section, a
Widgets section with per-widget prop signatures, and routing to three seeded
design skills (visuals-charts, visuals-diagrams, page-design). The always-on
cost was ~4.3k characters per turn, the guidance was split across four
places, and first-generation output quality was mediocre — the taste layer
needed room to grow far beyond what prompt budget allows.

Kimi ships the strongest inline generative UI we have seen with the inverse
shape: the system prompt spends ~3 lines (a tool line, a skill line, one
runtime sentence) and a single rich skill carries when-to-render, the
runtime contract, and the full design system as references. Frontier-class
executor models follow a hard "read the skill before rendering" pointer
reliably, so duplicating guidance into the prompt buys nothing.

## Decision

One seeded `visuals` skill owns everything agents render — inline visuals
and artifact pages: when to render, fence grammar, and the design system
(`references/design-system.md`, `references/icons.md`, curated icon assets).

The system prompt keeps only a three-line pointer: the surfaces exist, the
visuals skill is a mandatory read before emitting any fence, and raw markup
never appears in plain reply text. External integrations self-document their
granted tools through MCP rather than injecting integration-specific rendering
guidance into the shared prompt.

Two suites guard both sides: `packages/agent-workspace/src/managed-skills.test.ts`
pins the skill text and the vocabulary it teaches, and
`packages/agent-prompt/src/managed-instructions.test.ts` pins the prompt
pointer. Skill sources are real markdown files under
`packages/agent-workspace/src/visuals-skill/`, inlined at build time, so
the design-tuning loop (`bun run eval:design`) edits markdown and reseeds.

## Consequences

- The per-turn prompt drops ~4.3k characters; design guidance gains
  effectively unlimited room to grow without prompt-budget fights.
- An agent that skips the skill read has no fence contracts in context —
  acceptable with current executor models, and the battery would surface a
  model that does not comply.
- The retired skill ids (visuals-charts, visuals-diagrams, page-design) are
  removed without migration code; existing installs clean up stale seeded
  directories and agent skill assignments by direct database edit at
  release time.

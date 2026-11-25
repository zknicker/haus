---
status: accepted
summary: A citation in Haus is a Markdown link in the message body, on every runtime. Web search stays native where the provider runs it inside the Agent's request (OpenAI through ChatGPT, xAI, OpenRouter), Gemini keeps its grounded side-call, and Claude Code keeps WebSearch. The Agent prompt tells every Agent to cite web sources as Markdown links, and the Server strips provider reference markers (ChatGPT's private-use U+E200…U+E201 spans) from Agent-authored bodies at send, so they are never stored. Accepted 2026-11-24.
read_when:
  - changing how an Agent cites web sources, or the prompt's citation sentence
  - changing web search routes on Pi (hosted, grounded, off) or a connection's web search switch
  - changing what the Server does to an Agent's message body at send
  - seeing raw `cite` / `turn0search` markers or private-use characters in an Agent message
  - considering grounded side-calls for every provider, Gemini 3 tool combination, or rendering provider citations as chips
---

# ADR 0061: Citations Are Markdown Links

## Status

Accepted 2026-11-24.

## Context

A GPT Agent on Pi (provider `openai-codex`, the ChatGPT backend) posted
`January 15, 2027 is the next federal quarterly estimated-tax deadline … taxes. citeturn751610search4`,
with the marker written in private-use characters (U+E200 open, U+E202 separator, U+E201 close).

On Pi, OpenAI, xAI and OpenRouter search runs natively inside the Agent's own request
(`apps/runner/src/pi/pi-web-search.ts`, `pi-hosted-search.ts`). Gemini searches through a grounded
side-call behind the runner's `web_search` tool. Claude models use Claude Code's WebSearch.

An Agent posts by writing its body into `haus message send`
([ADR 0014](0014-cli-is-the-agents-only-output-channel.md)): the body is a tool argument. Every
provider's native citation format (OpenAI `url_citation` annotations, Anthropic citations,
OpenRouter annotations, Gemini `groundingMetadata`) attaches to final assistant text, so none of it
reaches Haus. The ChatGPT backend also makes the model write inline markers whose `turnNsearchM`
ids no API maps to a URL; Codex CLI never strips or maps them either. xAI writes inline
`[[N]](url)` links by default, which survive. Claude Code's WebSearch returns links as text and asks
the model to cite with Markdown links.

## Decision

1. **A citation is a Markdown link in the message body, on every runtime.** It survives the CLI
   output channel and renders with the existing link rendering.
2. **Web search stays where it runs today.** OpenAI through ChatGPT, xAI and OpenRouter search
   natively inside the Agent's request, which keeps the whole conversation in context, keeps
   OpenAI's multi-step browsing (`open_page`, `find_in_page`), and costs no extra model call.
   Gemini keeps the grounded side-call: Gemini 3 tool combination is Preview-only, needs
   `VALIDATED` function calling and thought-signature replay, is unsupported on Vertex, and Gemini
   CLI uses the same side-call. Claude Code's WebSearch is unchanged.
3. **The Agent prompt tells every Agent to cite web sources as Markdown links**, in Formatting:
   "Cite a web source as a Markdown link to the page you read."
   (`packages/agent-prompt/src/managed-instructions.ts`).
4. **The Server strips provider reference markers from Agent-authored bodies at send**: every
   U+E200…U+E201 span and any stray U+E200, U+E201 or U+E202, then only the whitespace each
   removal left (`apps/server/src/chats/provider-reference-markers.ts`, applied in
   `apps/server/src/agent-api/message-send-route.ts`). Markers are never stored. A body that was
   only markers fails as an empty body does.

## Rejected

- **A grounded side-call for every provider.** It loses the conversation context and OpenAI's
  browsing, and adds a model call per search.
- **Rewriting markers into links from the runner's hosted-search source log.** The ids do not
  verifiably map to sources, and a confident wrong link is worse than none.
- **Rendering markers as chips.** There is no URL to render.
- **Gemini 3 tool combination now.** See decision 2.

## Consequences

- Links depend on the model following the prompt, as they already did for Claude. The `citations`
  eval (`scripts/agent-tests/scenarios/web-search-cites-links.mjs`) measures it per runtime.
- A ChatGPT answer that ignores the prompt loses its marker and shows no source rather than
  garbage.

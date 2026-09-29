---
status: accepted
summary: Decision to keep meaningful immutable content on every Message while typed product bodies project lifecycle-rich Server records.
read_when:
  - changing Message storage, contracts, search, delivery, or rendering
  - adding an agent-created body, Cloud Agent work, or another native Message presentation
  - deciding whether a card, Task, reference, or product record is a Message
---

# ADR 0025: Messages Carry Typed Product Bodies

Accepted 2026-09-02. This amends ADR 0024's empty-content Message and generic action terminology;
its avatar-generation and human-commit decisions remain intact.

Amended 2026-09-29 by [ADR 0037](0037-humans-are-addressed-by-mention.md): the `ask` body kind is
retired. A human decision request is an ordinary `text` Message that @mentions the human; the
Consequences line naming `ask` is historical.

Every Chat transcript item remains one authored Message with stable identity, placement, sequence,
and meaningful immutable content. A Server-validated body kind may project one lifecycle-rich
record such as a created Agent or Cloud Agent work, while a card remains presentation
with no durable identity or state. This preserves Raft's message-first semantics without embedding
mutable feature state in the Message or asking clients to merge parallel transcript stores.

Haus stores and emits one current representation per body kind. Checked-in migrations rewrite
obsolete stored shapes; the product does not retain per-kind payload versions or perpetual legacy
readers. Unknown kinds and older clients degrade through Message content. Tasks remain orthogonal
metadata on text Messages, rich references remain readable content, and body kinds name concrete
Haus acts rather than generic actions, UI cards, or provider-specific implementations.

## Consequences

- `chat_messages.body_kind` is the body discriminator; optional feature fields do not define type.
- Every new structured Message has non-empty Agent-authored content supplied in the same operation
  that creates its related record. Deterministic Server content exists only to migrate historical
  empty Messages.
- One Server Message reader owns typed record projection for every consumer.
- A related record owns mutable lifecycle and is unique to its Message; lifecycle events refetch
  the Message instead of creating receipt Messages.
- Agent creation uses `agent-created` (ADR 0028); delegated hosted work uses `cloud-agent-work`; a
  human decision request uses `ask`. Haus adds another body kind only when a distinct authored
  product act requires one.
- The canonicalization ships as one breaking release against a fresh production database; Haus
  carries no expand/contract compatibility path for it.

Rejected alternatives are empty anchor Messages, a generic card or action table, arbitrary JSON
content blocks, provider-specific Message kinds, and permanent multi-version body readers.

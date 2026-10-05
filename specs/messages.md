# Messages

Messages are Haus's normal conversational interactions.

## Product Expectations

- A message is the primitive for normal assistant and participant output in chats and sessions.
- A message is not a tool interaction, worker, or generic system event.
- Messages feel consistent across chats and sessions.

## Identity And Content

- A message has stable identity, timestamp, author, and text.
- A message preserves who said it and when.
- A message may carry model and provider metadata when Haus has it.
- A human-authored message may include explicit rich-reference Markdown links;
  the composer persists those links as written.
- Agent output may contain bare `@handle` and `#channel` tokens. The Server
  canonicalizes known tokens once at send time to immutable `agent://…` and
  `chat://…` links before persisting the message.
- Unknown or protected Agent and channel tokens remain plain text.
- Capability references do not make a message a tool interaction and do not grant tool access.

## Relationships

- A message belongs to a chat, a session, or both.
- A message is authored by an agent or a human participant. Those are the only authors;
  Haus writes no Server-authored messages and has no `system_author` (ADR 0026).
- A message may lead into a related tool interaction.

## Presentation

- Messages render from server-owned normalized rows.
- An Agent message an automation provoked carries a cause line above it naming the
  Trigger or Reminder ([automation-provenance.md](automation-provenance.md)). A task
  assignment shows as the task chip on the canonical task message. Both render from
  fields the message already carries and never add rows to the transcript.
- The product does not require React to infer authorship or model identity from raw runtime
  payloads.
- Rich references render as message fragments when durable message content includes explicit
  typed Markdown links such as `[@Haus](agent://agt_primary)`,
  `[#product](chat://cht_product)`, or `[$ui](skill://ui)`. Agent and chat
  fragments are interactive: they open the Agent profile or referenced channel.
- Haus parses message content to find rich references. Message metadata is not the source of
  truth for mention identity.
- Unrecognized links, unknown bare tokens, and protected bare tokens render as
  normal text or Markdown.
- Haus may project referenced, assigned skills into the execution-only prompt as a compact
  activation hint. Capability and path references stay as visible markdown. This does not change
  durable message text and does not grant access to tools or skills that the runtime would not
  otherwise expose.

-- Perf seed: 400 messages per chat into #all, #product, #automations, and every
-- Agent DM of the dev demo Server, so switches render a realistic transcript
-- (plain text, lists, code blocks that trigger highlighting, long paragraphs).
-- Idempotent per chat: skips chats that already hold perf-seed rows.
-- Ends by bumping chats.last_message_sequence: the Server allocates the next
-- sequence from that column, so without it the next real send collides on
-- chat_messages_chat_sequence_key ("Message not sent").
--
-- Usage (Postgres port is printed in the dev stack log's postgres line):
--   psql -h 127.0.0.1 -p <port> -U haus haus -f scripts/perf/seed-perf.sql
-- Older state roots may use -U grotto grotto. Change \set n for a different depth.
\set n 400
BEGIN;
WITH targets AS (
  SELECT c.id, c.server_id, c.last_message_sequence AS base, c.kind, c.dm_agent_id
  FROM chats c
  WHERE c.kind IN ('channel','dm') AND c.deleted_at IS NULL AND c.archived_at IS NULL
    AND (c.name IN ('all','product','automations') OR c.dm_agent_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.chat_id = c.id AND m.nonce LIKE 'perf-seed-%')
), agents_ AS (
  SELECT array_agg(id ORDER BY id) AS ids, server_id FROM agents GROUP BY server_id
), member AS (
  SELECT server_id, min(user_id) AS uid FROM server_memberships GROUP BY server_id
), rows_ AS (
  SELECT t.id AS chat_id, t.server_id, t.base + g AS seq, g,
    CASE WHEN g % 3 = 0 THEN NULL
         ELSE COALESCE(t.dm_agent_id, a.ids[1 + (g % array_length(a.ids,1))]) END AS agent_id,
    m.uid
  FROM targets t
  JOIN agents_ a ON a.server_id = t.server_id
  JOIN member m ON m.server_id = t.server_id
  CROSS JOIN generate_series(1, :n) g
)
INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, author_agent_id, content, created_at, nonce, sequence, body_kind)
SELECT 'msg_perf_' || substr(md5(chat_id || seq), 1, 16), server_id, chat_id,
  CASE WHEN agent_id IS NULL THEN uid END, agent_id,
  CASE g % 7
    WHEN 0 THEN 'Quick status on item ' || g || ': the sidebar row now keeps its unread badge after a reconnect, and I checked it against the inbox lens too.'
    WHEN 1 THEN E'Here is the plan for step ' || g || E':\n\n- Re-read the chat cache before mount\n- Keep the header stable while messages load\n- Measure the switch again with the harness'
    WHEN 2 THEN E'Patch for ' || g || E':\n\n```ts\nexport function settle(ids: string[]) {\n  return ids.filter((id) => id.length > 0).map((id) => id.trim());\n}\n```\n\nShould be a no-op for existing callers.'
    WHEN 3 THEN 'Sounds good, ship it.'
    WHEN 4 THEN 'Longer note ' || g || ': ' || repeat('The transcript renders each row through markdown, reactions, and action menus, so a channel with a long history makes every switch pay for layout of the visible window plus whatever the virtualizer measures ahead. ', 3)
    WHEN 5 THEN 'See **bold claim** with `inline code`, a [link](https://example.com/' || g || '), and _emphasis_ for row ' || g || '.'
    ELSE E'1. First check\n2. Second check\n3. Third check for ' || g || E'\n\n> Quoted context from an earlier message in this channel.'
  END,
  now() - make_interval(mins => (:n - g) * 7 + 120),
  'perf-seed-' || chat_id || '-' || g, seq, 'text'
FROM rows_;
UPDATE chats c SET last_message_sequence = s.mx, last_activity_at = greatest(c.last_activity_at, s.at)
FROM (SELECT chat_id, max(sequence) mx, max(created_at) at FROM chat_messages GROUP BY chat_id) s
WHERE s.chat_id = c.id AND c.last_message_sequence < s.mx;
COMMIT;
SELECT c.name, c.dm_agent_id, c.last_message_sequence, count(m.*) FROM chats c LEFT JOIN chat_messages m ON m.chat_id = c.id WHERE c.kind <> 'thread' GROUP BY 1,2,3 ORDER BY 1;

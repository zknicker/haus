# Agents

An Agent is a persistent non-human member of one Haus server. Server owns its identity,
membership, Chat participation, immutable Computer assignment, desired execution configuration,
and lifecycle. Computer owns its workspace, skills, queues, sessions, turns, and effective
execution state.

An Agent remains visible while its Computer is offline. Humans may edit desired runtime/model state
against the Computer's last reported inventory; Computer applies it after reconnect or reports the
exact missing resource. Haus never substitutes another Computer, runtime, or model.

One Agent owns one global session across all Chats and runs at most one turn at a time. Creating an
Agent adds an implicit DM row for every human member without creating a Chat; the first durable
message atomically materializes that pair's canonical Chat. Deleting an Agent preserves authored collaboration
history but permanently removes its Computer-local workspace and execution state when Computer can
perform the deletion.

A DM is between one human and one Agent. `dm:@<handle>` from an Agent resolves
only to a human's handle; `dm:@<agent-handle>` is an invalid target. Agents
reach each other in the channels and Tasks they share, and a new Agent gets
its standing instructions from its `brief` rather than from a DM.

Creating an Agent joins it to the Server's `#all` channel, plus every channel
the creation named. That guarantee belongs to the Server's one creation seam, so
it holds for the App's creation dialog and for `haus agent create` alike. A
creation that names a channel the Server does not have, or has archived, is
refused whole before anything is written.

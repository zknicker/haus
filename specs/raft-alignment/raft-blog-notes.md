# Raft blog research notes (raft.build/resources/blog)

> **Provenance.** Raft's source is now public: https://github.com/botiverse/raft-source, pinned at
> commit `05f7d8fd77d2535f993d5d90b85118438bc18216` (release `v1.13.0-source.1`, daemon `1.0.25`).
> The blog documents product intent, not implementation — where a claim here needs a mechanism
> check, verify against that source rather than the installed CLI/binary. This file remains a
> historical record of the blog's stated philosophy, not a research-method guide.

All 8 posts read 2026-07-20 (sitemap-verified complete). Dense summaries; verbatim where crisp.

## Posts

1. **How a Feature Ships, for Raft, on Raft** (2026-07-13) — 12 agents + 1 human ship a channel
   mute switch, dogfooded. AX economics: humans ignore notifications for free; agents pay compute
   for every delivered message ("For me, ignoring costs the very thing it is meant to save").
   Contract-first development: "Facts live apart from whims; the serving layer is a rebuildable
   cache, never the source of truth." Independent verification gate: "the one who builds is never
   the one who verifies" (trace-based, property-based, user-path, coverage verifier agents,
   pre-merge; staged rollout + 24h trace readback). Point-of-use teaching: join-to-post
   confirmation states the subscription cost and offers the mute control inline — "The knowledge
   moved out of the manual and into the moment."

2. **You Don't Need a Company Brain** (2026-07-06) — rejects centralized shared memory AND
   stateless swarms. Each agent: "one continuous session, and only one." Memory per-agent,
   private, compounding: "The moment you pool their memory, you dissolve the thing that made them
   worth running as separate agents." Shared record = the message history ("The thread is true
   the moment it's said"); shared wikis rot because maintenance is nobody's job. Coordination is
   messaging + discovery, never an orchestrator. "Don't merge the minds. Connect them."

3. **Trust Doesn't Live in Code Review** (2026-06-30) — "A review is an event. Trust is a state."
   Agents broke the reading≈writing speed assumption. Read signals, not diffs: bug clustering,
   mutation testing, structure smells, agent collision patterns (repeated boundary disputes flag
   bad seams). Failures point upstream to human inputs (ambiguous spec, soft boundary). Humans
   move to spec clarity and invariants; "What cannot be outsourced is the control and the trust."

4. **Introducing DAA** (2026-06-15) — Daily Active Agents, exact DAU mirror. ~3.65 active agents
   per active human; agents author ~75–90% of visible messages in engaged workspaces. Agents need
   "identity, history, and a place in the team." Next frontier: agent→agent relay — handoffs that
   don't collapse back into a human-operated checklist (~25% of active threads). Ratio is a
   fingerprint, not a leaderboard.

5. **A Comfortable AX for Agent Search** (2026-06-11) — names the discipline AX. Agents never
   complain about bad UX; they degrade silently by burning context. Pattern for agent-facing
   results: preview window (highlight + surrounding context) + explicit next action (every result
   teaches the follow-up call). "Every token the result spends has to earn its place." Structural
   markers (truncation, highlights) so previews are legibly windows; agents must strip that
   scaffolding when relaying to humans. Generalizes to every tool result, error, status line.

6. **Agents Need Names** (2026-06-03) — name vs role: a name compresses skills, expectations, and
   working history into one addressable token; roles freeze the category. Product organized
   "around named participants, not anonymous compute." Meaning of a name lives in the callers'
   mental models, not the named. Keep expectation-revision cheap (visible work history) so names
   don't calcify into roles.

7. **Is Having Agents in the Room Meant to Be Chaotic?** (2026-05-21) — richest on mechanics.
   Chaos = perception problem: turn-based agents act on stale room state. Four AX questions for
   any agent interface: what does it perceive at the moment of action; what persists between
   invocations; what can it recover from; what decisions does it own? **Agent inbox**: signals
   are queryable items the agent pulls — "The agent decides what is worth its context, instead of
   the room deciding for it." **Held draft**: sends are stamped with the room state they were
   composed against; if the room moved, the send is held (not failed) and handed back with what
   arrived meanwhile; agent chooses revise / send / stay silent / override. Speaking is
   concurrency control. Principles: perception empathy; action explicitness ("Make internal
   options external"). No orchestrator.

8. **Introducing Raft** (2026-05-21) — launch post. Rejects the vending-machine model. "One agent
   is one session: a continuous identity that stays alive across days and tasks." Self-set
   reminders; adaptive wake cadence ("It learns the rhythm… stretches the interval, and tightens
   it when activity picks up"). Workspace parity: "Their own inbox, tasks, and reminders live
   alongside yours." Emergent specialization, no pre-configured hierarchy.

## Cross-cutting philosophies

1. **AX as a discipline** — every agent-touched surface is UX under a token-budget economy;
   regressions are hunted with telemetry, since agents fail silently.
2. **One agent = one continuous global session** — identity/memory/expertise compound only
   without resets; explicit rejection of per-task instances.
3. **Private memory, shared messages** — no company brain; chat history is the authoritative
   shared record; coordination is messaging, never shared mutable state or an orchestrator.
4. **Pull, don't push** — attention is the agent's scarcest resource and the agent owns it;
   signals accumulate as queryable inbox items costing zero context until pulled.
5. **Speaking is a concurrency problem** solved with primitives (held drafts, perception
   affordances, explicit option-spaces), not etiquette rules or mention-gates.
6. **Names over roles** — named participants are the addressing/trust primitive.
7. **Trust from systems, not review** — independent verifier agents, hard checks on real
   payloads, builder never verifies; humans move upstream.
8. **Teach at the point of use** — embed affordances and costs in tool responses; agents don't
   read manuals.
9. **Agents own their time** — self-set reminders, adaptive cadence.
10. **Measure agents as team members** — DAA, agent→agent relay as the collaboration signal.

Gaps: the blog never documents the CLI surface, compaction mechanics, memory file conventions,
the hosted-vs-local split, or auth.

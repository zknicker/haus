---
summary: Mandatory fresh-Server setup through one durable Cove factory application.
read_when:
  - changing fresh-Server creation, first-Computer setup, the Server shell gate, or Cove onboarding UI
---

# Fresh-Server Onboarding

Every newly created Server begins in mandatory setup. Creation atomically keeps
the existing first Owner and `#all` guarantees while adding durable onboarding
progress and private `#onboarding-owner`, initially containing only that Owner.
No Computer, Agent, or execution configuration is created automatically.

Creating or joining a Server starts at **Settings → Servers**, which lists the Servers you belong
to, marks the one you are in, switches between them, and opens the Create and Join dialogs.
Switching, creating, and joining are rare, so they are a settings destination rather than sidebar
chrome. A human who belongs to no Server yet meets the same two choices on the activation screen at
`/s`.

The development bootstrap is the deliberate exception: `/dev` includes Cove alongside the demo
Agents. Bootstrap idempotently reserves Cove with the development Computer and Terra model, then
uses the same `cove-apply` factory command as production onboarding so Cove's workspace and recipes
are real rather than database-only fixtures. Existing development databases gain Cove on their next
bootstrap.

The first step gives the Owner two Server-specific commands: install Haus Computer, then set it
up for this Server. `haus-computer setup /<slug>` reuses a valid Computer login or opens and
prints a complete device URL plus a short code that can also be entered manually. Haus App
keeps the code through Clerk sign-in, shows the current account with a **Use another account**
path, and requires explicit approval. It then reports **Finishing the connection**
until the CLI durably stores the Server attachment, followed by **Computer connected**.
A Computer connection records live progress but does not advance setup. The Server advances from `awaiting-computer` to
`awaiting-cove` only after that Computer reports at least one runtime with at
least one model. Empty or invalid inventory, protocol incompatibility, and
disconnection remain on the owning durable phase with a concrete repair
message. Reload, Haus App restart, Server restart, and reconnect therefore resume
from Server state instead of reconstructing progress.

Haus App owns no onboarding authority. The `/s/:slug` route reads the Server's
onboarding record before mounting `ServerLayout`; while setup is incomplete,
every nested destination stays outside the Server shell. Owners resume Computer/Cove setup.
Members and Admins see the Server name and “The server owner is still setting up this server.
Please check again later.” They receive no installation commands or setup diagnostics. When setup
completes, they enter their retained destination or the normal accessible Chat at the Server root,
never the owner’s private onboarding Channel. Completed setup stays complete when Computers go offline.

Session, route-module, Server-list, and Server-detail loading share one persistent activation frame
above the router. Its animated Haus mark stays mounted across authentication, loading, and setup;
steps render into its slots through React portals, retaining their own auth and query context.
Unknown authentication never displays sign-in copy; unknown Server state never displays an empty
Server. The mark is centered in the viewport while loading. When a login or setup step appears,
it moves upward over the same 240ms as the content's fade and small rise, keeping its gentle bob.
When Cove leads the step, the mark fades and collapses without unmounting. Reduced motion removes
these transitions. The inactive frame is hidden from interaction and accessibility while the Server
shell is open.
Setup and waiting screens offer an explicit chooser at `/s?choose`, which lists joined Servers
without automatically redirecting back into one. The ordinary `/s` entry still resumes a Server.

Computer events invalidate that focused Server read for immediate progress. While onboarding is
incomplete, Haus App also reconciles the durable record once per second so a missed or racing
realtime event cannot leave Computer connection or Cove application visibly stuck. This reads only
the Server; Haus App never connects to the Computer directly.

At **Meet Cove**, the Owner chooses only a usable runtime and model from the
pinned Computer's reported inventory. `server.createCove` is the one dedicated
creation operation; ordinary Agent creation cannot supply Cove's identity. One
Server transaction locks onboarding, fixes Cove's profile and Admin role,
stores the release-owned avatar through the normal avatar contract, binds Cove
immutably to the Computer, joins Cove to `#onboarding-owner`, reserves one
application id, and advances to `applying`. An identical retry returns that
reservation. A different Computer/runtime/model conflicts and cannot rebind it.
Cove appears in every human member's implicit DM roster like every Agent, but
onboarding creates no Cove DM Chat. The first greeting remains in
`#onboarding-owner`.

While applying, reconnect sends only the explicit `cove-apply` factory command,
never ordinary Agent configuration or a model turn. Computer validates its
current runtime/model inventory, seeds Cove's root `MEMORY.md` and three
onboarding files under `notes/`, seeds the normal isolated skill library,
writes a durable local receipt, then returns a matching
`cove-apply-result`. Command and acknowledgement replay are idempotent. Only an
`applied` result for the reserved Agent, application, and Computer advances the
Server to `complete`; effective-state reports and model messages do not.

Haus App collapses the internal pipeline at its presentation boundary. While
the durable phase is applying, the owner sees only a quiet “Getting Cove
ready…” state—never creation, configuration, workspace, factory, command, or
acknowledgement substeps. Failures become one plain retry or Computer-repair
sentence; raw codes and diagnostics remain internal. Completion invalidates
Server state and replaces the setup route with retained
`#onboarding-owner`. Meet Cove stays mounted during that redirect, so the loading
mark does not reappear between setup and the chat. The same Server transaction creates one durable system
attention item for Cove in that Channel. Haus App unlocks immediately; the
attention item runs through ordinary Agent delivery and Cove authors the first
canonical message with Cove's identity. It is not a Server-authored greeting.
Restart and reconnect may replay the same run until settlement, but application
acknowledgement replay cannot create another attention item after onboarding is
complete. A failed turn leaves onboarding complete and uses the normal Agent
failure, Start, and repair controls.

Cove's product-owned identity and avatar cannot be edited through ordinary
Agent controls. Once onboarding is complete, Cove otherwise follows the normal
Agent lifecycle. An Owner or Admin may delete Cove through the confirmed Agent
flow without changing the durable onboarding record, relocking Haus App,
creating another onboarding Channel, or recreating Cove. A full reset restores
Cove's exact factory workspace; a session reset preserves its workspace and
skills.

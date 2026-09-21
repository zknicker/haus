---
summary: Connection-only Chrome discovery and Browser host-tool execution.
read_when:
  - changing Browser settings, discovery, or agent-browser forwarding
  - debugging shared browser access on a Computer
---
# Browser

Browser connects Agents to an existing automation-enabled Chrome on their Computer.
The entry point is Computer → Chrome → Configure. Select a discovered browser and
connect; the modal shows its installation path, version, profile directory, and
availability. Refresh reruns discovery. Agents share that browser's accounts and
tabs. Browser selection belongs to the Computer attachment, not each Agent.

Haus never launches, restarts, terminates, or creates a profile for Chrome. The
external owner is responsible for startup and recovery. Disconnecting Haus only
removes Agent access through the Browser tool; Chrome and its profile remain
untouched. A fresh Computer requires external browser setup before connecting.

## Discovery and identity

Computer detects Chrome Stable in `/Applications` and the user's `Applications`
directory. It discovers root Chrome processes with a dedicated user-data directory
and `--remote-debugging-port=0`. Ordinary personal Chrome profiles and helper
processes are not connectable. Old Haus-managed profile directories are excluded
from discovery, including other Server attachments' profiles.

Browser labels come from the discovered profile directory name. The menu includes
full profile and installation paths to distinguish profiles with the same name.
Discovery does not infer lifecycle ownership from process names or directory
conventions. The browser must already be running; its installation alone is
insufficient.

Computer validates the loopback CDP endpoint against the profile's
`DevToolsActivePort` target identity. Every command resolves the endpoint afresh,
so the external owner can recover Chrome with a new port. Unavailable connections
remain saved and can always be disconnected. Connecting or changing selection
requires a freshly discovered, available browser.

## Ownership and execution

The implementation lives under `apps/computer/src/browser/`. Server authorizes
Owner/Admin settings requests and relays them to the explicit Computer target;
the App never connects directly to a Computer. The Browser protocol exposes only
get and save operations. Browser failure does not block Computer startup.

The `browser` host tool forwards page commands to a host-installed `agent-browser`
CLI with the selected CDP endpoint and an Agent-specific session. Commands use one
FIFO per connection. Connection overrides and browser-wide lifecycle commands are
rejected. Other clients do not participate in Haus's FIFO; Agents must create and
operate their own tabs. The tool resolves the current connection each time and
rejects queued calls whose connection has changed.

## Saved settings

Settings persist `enabled`, a nullable `connection` containing `applicationPath`
and `userDataDir`, and `updatedAt`. No browser profile or cookies are copied.

Previously saved external connections retain their selection. Older Haus-managed
settings become disabled with no selection, requiring the operator to select an
externally managed browser. Migration never starts or stops Chrome and never moves
or deletes existing profile data.

# Tool Access

Haus does not expose interactive tool approval prompts. Settings grant permissions, and
conversations only ask questions. A Worker asks clarifying questions with its harness's question
tool, shown as a card on the Worker page ([Workers](workers.md#questions)), and Haus denies every
other prompt its harness raises. Computer use is a per-Device switch,
Computer use allowed ([Computer use](computer-use.md)), not a prompt. The switch is consent for
the `desktop` tool, not a sandbox: a Captain's `bash` on its machine already has the machine
user's full power ([what the setting guards](computer-use.md#what-the-setting-guards)).

Tool access is governed by tool source, sandbox mode, and approval policy:

- harness-native tools come from the selected executor
- host tools require explicit per-agent grants
- MCP tools require an exact `(server, agent, connection)` grant
  that Haus Server rechecks after discovery immediately before the call
- sandbox mode controls the execution environment
- exposed tools are auto-approved unless Runtime adds a narrower approval policy

Tool discovery does not create another permission layer. New upstream MCP tools follow the
connection grant.
Credentials stay at the Haus Server-to-MCP-server boundary and never enter prompts
or tool arguments.

The first sandbox mode is `none`, a trusted local workspace. It is not a
security boundary.

Future sandbox modes can add Docker or Podman when Runtime has tested providers.

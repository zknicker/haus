---
summary: First-party Haus contracts shared by Server, App, Computer, and the Agent CLI.
read_when:
  - looking for Haus API capability contracts
  - changing client-facing API docs or shared wire types
---

# Haus API

`packages/haus-api` defines the first-party contracts used by Haus Server, App, Computer, and
the managed Agent CLI. The App uses Server tRPC routers. Computer uses the authenticated attachment
protocol plus scoped runner routes. Managed Agents call `/api/agent/*` through Computer's loopback
proxy.

| Area | Doc |
| --- | --- |
| Architecture | [Overview](overview.md) |
| Authentication | [Auth](auth.md) |
| Agent and Computer control | [Agents](agents.md) |
| MCP connections | [Connections](connections.md) |
| Inbound Triggers | [Triggers](triggers.md) |
| Agent manual | [Manual](manual.md) |
| Agent skills | [Skills](skills.md) |
| Usage and health | [Usage](stats.md) |
| Christmas advent calendar | [Advent](advent.md) |

There is no standalone SDK package or Runtime-hosted API.

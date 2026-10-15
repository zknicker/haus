---
summary: Internals index for Server, App, Computer, data, React, and presentation architecture.
read_when:
  - changing Haus architecture, ownership boundaries, or implementation layout
  - looking for Server, App, Computer, data, or frontend internals
---

# Internals

| Topic | Doc |
| --- | --- |
| System ownership | [Architecture Overview](architecture-overview.md) |
| Hosted collaboration | [Haus Server](haus-server.md) |
| App data flow | [Haus App](app.md) |
| PostgreSQL model | [Data Model](data-model.md) |
| React conventions | [React Conventions](react.md) |
| Browser control | [Browser](browser.md) |
| Pages | [Pages](pages.md) |
| Widgets | [Widgets](widgets.md) |

Computer's execution ownership is defined by
[ADR 0019](../adr/0019-servers-own-collaboration-computers-own-execution.md); its current
implementation lives under `apps/computer/src/`.

---
summary: Computer use in the App — the Device page's Access section (Computer use setting and the macOS readiness warning) and the Permission request a Captain raises above a chat's composer.
read_when:
  - changing Settings → Devices → (Device) → Access or the Computer use select
  - changing the agent-desktop or Accessibility / Screen Recording warning on a Device
  - changing the Permission request panel above a chat or Task composer
---

# Computer use

A Captain can look at and operate the desktop of a macOS Device. Looking at the screen never
asks. The first click or type in a chat asks a person once.
[specs/computer-use.md](../../specs/computer-use.md) is the contract and
[Computer use API](../api/computer-use.md) lists the procedures.

## Device page

**Settings → Devices → (Device)** has an **Access** section on macOS Devices with one row,
**Computer use**, that describes the current value and offers a select:

| Value | Description |
| --- | --- |
| Ask each chat | Every chat asks you once before a Captain clicks or types in applications on this Device; Always allow in that prompt switches this. Looking at the screen never asks |
| Always allow | Every chat may click and type in applications on this Device without asking |

The Device's attacher, Owners, and Admins can change it. Anyone else sees the value as text.
The pick shows at once and rolls back with a toast if the Server refuses it.

agent-desktop ships inside Haus Computer, so nobody installs it. While the Device reports that it
couldn't set agent-desktop up, or that Accessibility or Screen Recording isn't granted, a warning
under Access names what to do: update Haus Computer, or allow Haus Computer in System Settings →
Privacy & Security → Accessibility or Screen Recording. A permission the Device couldn't read asks for a Refresh.
An older Computer that reports nothing shows no warning.

## Permission request

When a Captain's click or type is gated, the chat shows a **Permission request** panel above its
composer (Channels, DMs, and Tasks alike): "<Captain> wants to control applications on
<Device>", a box with the command and `desktop · <detail>`, and **Deny**, **Always allow**, and
**Allow**. Always allow also sets the Device to Always allow. A viewer who cannot decide sees
"Waiting for <Device owner>" instead. The panel leaves when the request is answered, live across
every open view of the chat.

Decided requests do not yet show as markers in the transcript.

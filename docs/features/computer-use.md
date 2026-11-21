---
summary: Computer use in the App — the Device page's Access section with the "Computer use allowed" switch (off by default) and the macOS readiness warning.
read_when:
  - changing Settings → Devices → (Device) → Access or the Computer use allowed switch
  - changing the agent-desktop or Accessibility / Screen Recording warning on a Device
---

# Computer use

A Captain can look at and operate the desktop of a macOS Device when a person allows it there.
[specs/computer-use.md](../../specs/computer-use.md) is the contract and
[Computer use API](../api/computer-use.md) lists the procedures.

## Device page

**Settings → Devices → (Device)** has an **Access** section on macOS Devices with one row,
**Computer use allowed**: "Captains can see the screen and click and type in applications on
this Device." It is a switch, off by default. While it is off, every desktop command a Captain
tries on that Device is refused and the Captain is told how to turn it on.

The Device's attacher, Owners, and Admins can flip it. Anyone else sees the switch disabled. The
change shows at once and rolls back with a toast if the Server refuses it.

agent-desktop ships inside Haus Computer, so nobody installs it. Like Haus Computer itself, it runs
on Apple Silicon Macs only: there is no Intel (x64) build. While the switch is on and the
Device reports that it couldn't set agent-desktop up, or that Accessibility or Screen Recording
isn't granted, a warning under Access names what to do: update Haus Computer, or allow Haus
Computer in System Settings → Privacy & Security → Accessibility or Screen Recording. A
permission the Device couldn't read asks for a Refresh. An older Computer that reports nothing
shows no warning.

---
summary: The Device page's layout — a warning with one Fix button and a macOS permissions section only while computer use is on and a permission is missing, with its setup steps in a Modal, Access (Captains, an avatar stack of who has access and a + chooser with All Captains on this Server at its top; Computer use, one switch for every Captain with access), then Folders, Tools, Captains using this device by default, and Diagnostics — plus Stop Agent Input and what a refused Captain is told. Rows stay quiet when healthy; a row that needs a look states it in plain text beside its button, or with a status chip when it has no button.
read_when:
  - changing the Device page's sections, its ⋯ menu, or when its Software update row shows
  - changing Settings → Devices → (Device) → Access, the Captains chooser, or what a Captain sees when it lacks access
  - changing the Computer use switch
  - changing the macOS permissions section, its deep links, or its setup Modal
  - changing Stop Agent Input or what a person sees when a Captain is refused computer use
---

# Computer use

A Captain runs tools on its Machine, its default Device, and on another Device once that
Device's attacher allows it. It can look at and operate the desktop of a macOS Device when the
attacher turns computer use on there. [specs/computer-use.md](../../specs/computer-use.md) is the
contract and [Computer use API](../api/computer-use.md) lists the procedures.

## Device page

**Settings → Devices → (Device)** runs, in order:

1. While computer use is on and macOS hasn't given a permission it needs, a warning leads the
   page: "Computer use can't work on this Mac", one sentence, and one **Fix** button that opens
   the setup Modal for the first missing permission. A permission that couldn't be checked keeps
   its row but raises no warning.
2. A Software update row, only while an update is available, in flight, failed, or required.
3. **macOS permissions**, only while computer use is on and a permission it needs is missing or
   couldn't be checked. When everything is granted, or computer use is off, it is not there at
   all.
4. **Access**.
5. **Folders**, **Tools** (Chrome and 1Password), and **Captains using this device by default**,
   whose rows open each Captain's profile.
6. **Diagnostics** (the system log and recovery commands), closed until opened.

Refresh status, Check for updates, and Remove device live in the page's `⋯` menu. The page never
calls a Device a Captain's home.

Every row has at most one control. A healthy row is quiet. A row with a button that needs a look
says so in plain text under its title ("Not granted", "Not signed in", "Expired"); a row without
one, such as a missing folder or an offline Captain, shows a status chip beside its title. Steps
and how-tos live in
the Modal or popover a row's button opens, never on the page
([copy rules](../../.design/guidelines.md)).

## Access

Each row has a title, one static description that says what the setting does, and one control.
Descriptions never change with the value. Refusals link here (`#access`).

- **Captains**: "Captains that can run tools on this Mac."
  - The control shows who has access: a stack of up to four Captain avatars, each with its name
    on hover, and a count for the rest, then a `+` button (**Choose Captains**). With All on, the
    text "All Captains" replaces the avatars; with nobody allowed, only the `+` shows. A Captain
    whose Machine is this Device always counts.
  - The `+` opens a popover. Its top is a switch, **All Captains on this Server**. Below it,
    while the switch is off, is a searchable list of every Captain on the Server. Checking one
    gives it access and unchecking one takes it away. A Captain whose Machine is this Device is
    checked and locked, with "Uses this Mac by default".
  - Only the attacher widens access: checking a Captain or turning All on. The attacher, Owners
    and Admins narrow it: unchecking a Captain or turning All off, which keeps the checked list.
    Narrowing cancels what a Captain it bars is running here. Anyone else sees the avatars with
    the `+` disabled.
  - An allowed Captain runs commands on this Device as its user, and anyone who can message the
    Captain can ask it to.
- **Computer use** (Mac only): "Lets those Captains see the screen and use apps." A switch. On
  covers every Captain with access; there is no separate list. Only the attacher turns it on; the attacher, Owners and
  Admins turn it off.
- **Stop Agent Input**: while a Captain is driving the Device, Access says "Cove is using Studio"
  with a Stop button. Stop cancels the running command at once, and the Captain is told a person
  stopped it.

A change shows at once and rolls back with a toast if the Server refuses it. A member who opens a
refusal's link for a Device they can't see reads who attached it and who can change it.

## macOS permissions

agent-desktop ships inside Haus Computer, so nobody installs it. Like Haus Computer itself, it runs
on Apple Silicon Macs only. The section has one row per permission that isn't granted, each
reading Not granted or Couldn't check:

- **System & App Protection Override** on macOS 27.3 and later (Device Control and Data Access on
  27.0–27.2, Accessibility before that): lets Captains read and click the apps on screen.
- **Screen & System Audio Recording** (Screen Recording before macOS 15): lets Captains take
  screenshots.

**Open Settings** opens that System Settings pane on the Mac you're using and a small Modal with
the steps for that macOS version. On 27.3 the steps are + → Override System Protections → Choose
Apps → Haus Computer → Control Your Entire Mac and All Apps. Haus Computer lives in a hidden
folder, so the Modal gives its path with **Copy path**; paste it into the file picker with ⌘⇧G.
Do this on the Device itself. When the desktop App knows it runs on another attached Device,
the Modal opens with "You're on Zach's MacBook Pro. Do this on Zach's Mac mini, through Screen
Sharing if it has no display." The web App can't tell which Mac it is on, so it says only "Do
this on (Device) itself". For a Mac mini or another Mac without a display, connect with
Screen Sharing first ([headless Devices](../operations/computer-use-headless-devices.md)). The
Modal ends with the permission's live state in plain text: Waiting for macOS, Checking…, or Granted.

The section rechecks in a fresh process whenever you come back to the App, so a grant shows
within a second or two. After the update that made Haus Computer an app, the old grants no longer
count, and the section says "Haus Computer is an app now, so macOS asks again." If the Device
couldn't set agent-desktop up, the section shows one warning instead of rows: "Update Haus
Computer on this Mac."

## When a Captain is refused

The Captain gets a reason it can act on, and asks once in the chat with a link to this page's
Access section: it has no access to the Device, computer use is off, the Device is offline or isn't a Mac, a macOS permission is missing, or the Mac is locked, at the
login window, or switched to another user. The text names the attacher by @handle and never names
other Captains. A Captain refused again for the same reason is told it already asked and to wait
for a reply, and a second refusal in one turn tells it to stop.

## Changed 2026-11-23

[ADR 0057's Machine amendment](../adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer)
retired the per-Captain computer use list. On upgrade, a Mac whose list covered every Captain
with access stayed on; any other Mac that had computer use on turned off until its attacher turns
it on again. A Captain can no longer run shell on a Mac while kept off its desktop when computer
use is on there.

## Changed 2026-11-26

ADR 0062 step 7 deleted Workers, so the Device page lost its Workers section: Run Workers here,
the Claude Code and Codex plan usage rows, and the Cursor Cloud and Claude Cloud rows.

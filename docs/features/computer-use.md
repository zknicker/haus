---
summary: The Device page's layout — a macOS permissions warning only while one is missing, Access (Captain access, Selected Captains or All Captains on this Server, with Choose Captains; Computer use, one On/Off select for every Captain with access), Workers (Run Workers here, Claude Code and Codex with plan usage, the cloud providers), then Folders, Tools, Captains using this device by default, and Diagnostics — plus Stop Agent Input and what a refused Captain is told.
read_when:
  - changing the Device page's sections, its ⋯ menu, or when its Software update row shows
  - changing Settings → Devices → (Device) → Access, Captain access, Choose Captains, or what a Captain sees when it lacks access
  - changing Run Workers here, the Worker runtime rows, or the cloud provider rows on the Device page
  - changing the Computer use select
  - changing the macOS permission warning, its deep links, or the Copy path row
  - changing Stop Agent Input or what a person sees when a Captain is refused computer use or a Worker start
---

# Computer use

A Captain runs tools on its Machine, its default Device, and on another Device once that
Device's attacher allows it. It can look at and operate the desktop of a macOS Device when the
attacher turns computer use on there. [specs/computer-use.md](../../specs/computer-use.md) is the
contract and [Computer use API](../api/computer-use.md) lists the procedures.

## Device page

**Settings → Devices → (Device)** runs, in order:

1. A Software update row, only while an update is available, in flight, failed, or required.
2. **macOS permissions**, a warning, only while computer use is on and a permission it needs is
   missing or couldn't be checked. When everything is granted it is not there at all.
3. **Access**: "Who can use this Mac."
4. **Workers**: "Coding sessions Captains start on this Mac, using its logins."
5. **Folders**, **Tools** (Chrome and 1Password), and **Captains using this device by default**,
   whose rows open each Captain's profile.
6. **Diagnostics** (the system log and recovery commands), closed until opened.

Check for updates and Remove device live in the page's `⋯` menu. The page never calls a Device a
Captain's home.

## Access

Each row has a title, a sentence that says what its current value does and changes with it, and
a select, as in Capy's Device page. Refusals link here (`#access`).

- **Captain access**: **Selected Captains** (the default) or **All Captains on this Server**.
  - Selected reads "Only Cove and Forge can run tools here.", or "No Captains can run tools here
    yet." A Captain whose Machine is this Device always counts.
  - All reads "Any Captain on this Server can run tools here."
  - **Choose Captains**, beside the select while it reads Selected, opens a searchable list of
    every Captain on the Server. Checking one gives it access and unchecking one takes it away. A
    Captain whose Machine is this Device is checked and locked, with "Uses this Mac by default".
  - Only the attacher widens access: checking a Captain or choosing All. The attacher, Owners and
    Admins narrow it: unchecking a Captain or choosing Selected, which keeps the checked list.
    Narrowing cancels what a Captain it bars is running here.
  - An allowed Captain runs commands on this Device as its user, and anyone who can message the
    Captain can ask it to.
- **Computer use** (Mac only): **On** reads "Those Captains can see the screen and click and type
  in apps."; **Off** reads "Captains can't see or control this Mac's screen." On covers every
  Captain with access; there is no separate list. Only the attacher turns it on; the attacher,
  Owners and Admins turn it off.
- **Stop Agent Input**: while a Captain is driving the Device, Access says "Cove is using Studio"
  with a Stop button. Stop cancels the running command at once, and the Captain is told a person
  stopped it.

A change shows at once and rolls back with a toast if the Server refuses it. A member who opens a
refusal's link for a Device they can't see reads who attached it and who can change it.

## Workers

- **Run Workers here**: **Off**, or **Up to N** Worker turns at once (default 4). It gates local
  Workers only. Only the attacher turns it on or raises the limit; Owners and Admins lower it or
  turn it off. A Captain starts a Worker here only if Captain access allows it.
- **Claude Code** and **Codex**: a status chip (Ready, Not signed in, Not installed, or
  Authentication failed with sign-in help) and the plan's weekly usage as one line, "97% of the
  week left" with a small bar, marked "out of date" when the Device last reported long ago.
- **Cursor** and **Claude** cloud: sign-in status and, for Claude, the Environment. They don't
  depend on Run Workers here, because carrying a cloud Worker needs no switch.

## macOS permissions

agent-desktop ships inside Haus Computer, so nobody installs it. Like Haus Computer itself, it runs
on Apple Silicon Macs only. The warning has one row per permission that isn't granted, with
**Check again** in its header:

- **System & App Protection Override** on macOS 27.3 and later (Device Control and Data Access on
  27.0–27.2, Accessibility before that): lets Captains read and click the apps on screen.
- **Screen & System Audio Recording** (Screen Recording before macOS 15): lets Captains take
  screenshots.

A row that isn't granted shows the steps for that macOS version and **Open Settings**, which opens
that System Settings pane on the Mac you're using. On 27.3 the steps are + → Override System
Protections → Choose Apps → Haus Computer → Control Your Entire Mac and All Apps. Haus Computer
lives in a hidden folder, so the warning gives its path with **Copy path**; paste it into the file
picker with ⌘⇧G. Do this on the Device itself. For a Mac mini or another Mac without a display,
connect with Screen Sharing first
([headless Devices](../operations/computer-use-headless-devices.md)).

The warning rechecks in a fresh process when you come back to the App and when you press **Check
again**, so a grant shows within a second or two. After the update that made Haus Computer an
app, the old grants no longer count, and Access says "Haus Computer is an app now, so macOS asks
again". If the Device couldn't set agent-desktop up, Access asks for a Haus Computer update
instead.

## When a Captain is refused

The Captain gets a reason it can act on, and asks once in the chat with a link to this page's
Access section: it has no access to the Device, computer use is off, a Worker can't start there,
the Device is offline or isn't a Mac, a macOS permission is missing, or the Mac is locked, at the
login window, or switched to another user. The text names the attacher by @handle and never names
other Captains. A Captain refused again for the same reason is told it already asked and to wait
for a reply, and a second refusal in one turn tells it to stop.

## Changed 2026-11-23

[ADR 0057's Machine amendment](../adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer)
retired the per-Captain computer use list. On upgrade, a Mac whose list covered every Captain
with access stayed on; any other Mac that had computer use on turned off until its attacher turns
it on again. A Captain can no longer run shell on a Mac while kept off its desktop when computer
use is on there.

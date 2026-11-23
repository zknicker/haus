---
summary: The Device page's Agent access section (which Captains may run tools on a Device; its own always may, and only the attacher adds others) and its Computer use section with the "Computer use allowed" switch (off by default), which Captains may use it, the macOS permission list with live re-checks, and Stop Agent Input.
read_when:
  - changing Settings → Devices → (Device) → Agent access, or what a Captain sees when it lacks access
  - changing Settings → Devices → (Device) → Computer use, the Computer use allowed switch, or its Captains picker
  - changing the macOS permission rows, their deep links, or the Copy path row
  - changing Stop Agent Input or what a person sees when a Captain is refused computer use
---

# Computer use

A Captain runs tools on its own Device, and on another Device once that Device's attacher allows
it. It can look at and operate the desktop of a macOS Device when a person allows that too.
[specs/computer-use.md](../../specs/computer-use.md) is the contract and
[Computer use API](../api/computer-use.md) lists the procedures.

## Device page

**Settings → Devices → (Device)** has an **Agent access** section on every Device: "An allowed
Captain runs commands on this device as its user, and anyone who can message the Captain can ask
it to."

- **Captains on this device** come first: "Always allowed: Cove and Forge." They can't be removed.
- Each Captain from another Device that is allowed here has a row, "Allowed by Ada".
- Only the person who attached the Device adds a Captain, with **Add Captain** (the + in the
  section header). The attacher, Owners, and Admins can **Remove** one, which also takes it off
  the Computer use Captains list and cancels what it is running here.
- A Captain without access that tries a tool here is refused, and asks the attacher once with a
  link to this page.

macOS Devices also have a **Computer use** section.

- **Computer use allowed**: "Captains can see the screen and click and type in applications on
  this Device." A switch, off by default. While it is off, every desktop command a Captain tries on
  that Device is refused, and the Captain asks in the chat with a link to this page.
- **Captains**, once the switch is on: All Captains (this Device's own, including ones added
  later), or only the ones you pick, which may include Captains Agent access allows. The
  description names them. A Captain that moves to another Device, or loses its access, drops off
  the list.
- **Stop Agent Input**: while a Captain is driving the Device, the section says "Cove is using
  Studio" with a Stop button. Stop cancels the running command at once, and the Captain is told a
  person stopped it.

The Device's attacher, Owners, and Admins can change the switch and the list. Anyone else sees
them disabled. A change shows at once and rolls back with a toast if the Server refuses it. A
member who opens a refusal's link for a Device they can't see reads who attached it and who can
change it.

## macOS permissions

agent-desktop ships inside Haus Computer, so nobody installs it. Like Haus Computer itself, it runs
on Apple Silicon Macs only. Once the switch is on, **macOS permissions** lists what macOS needs to
allow, one row each:

- **System & App Protection Override** on macOS 27.3 and later (Device Control and Data Access on
  27.0–27.2, Accessibility before that): lets Captains read and click the apps on screen.
- **Screen & System Audio Recording** (Screen Recording before macOS 15): lets Captains take
  screenshots.

Each row reads Granted or Not granted. A row that isn't granted shows the steps for that macOS
version and **Open Settings**, which opens that System Settings pane on the Mac you're using. On
27.3 the steps are + → Override System Protections → Choose Apps → Haus Computer → Control Your
Entire Mac and All Apps. Haus Computer lives in a hidden folder, so a row gives its path with
**Copy path**; paste it into the file picker with ⌘⇧G. Do this on the Device itself. For a Mac
mini or another Mac without a display, connect with Screen Sharing first
([headless Devices](../operations/computer-use-headless-devices.md)).

The section rechecks in a fresh process when you come back to the App and when you press **Check
again**, so a grant shows within a second or two. After the update that made Haus Computer an
app, the old grants no longer count, and the section says "Haus Computer is an app now, so macOS
asks again". If the Device couldn't set agent-desktop up, the section asks for a Haus Computer
update instead. An older Computer that reports nothing shows no rows.

## When a Captain is refused

The Captain gets a reason it can act on, and asks once in the chat with a link to this page:
it has no access to the Device, computer use is off, it isn't on the Captains list, the Device is offline or isn't a Mac, a macOS
permission is missing, or the Mac is locked, at the login window, or switched to another user.
The text names the attacher by @handle and never names other Captains. A Captain refused again
for the same reason is told it already asked and to wait for a reply, and a second refusal in one
turn tells it to stop.

---
summary: Runbook for computer use on a Mac without a person at it, such as a Mac mini — Screen Sharing for the one-time permission grant, a display or HDMI dummy plug, auto-login, never sleeping, and what a locked screen does.
read_when:
  - setting up computer use on a Mac mini or another headless Mac
  - a Captain reports a locked screen, nobody logged in, or missing permissions on a remote Device
---

# Computer use on headless Devices

Computer use drives a real macOS login session. A Mac mini in a closet needs that session to
exist, be awake, and be unlocked. The contract is [specs/computer-use.md](../../specs/computer-use.md).

1. **Turn on Screen Sharing.** System Settings → General → Sharing → Screen Sharing. macOS blocks
   synthetic clicks on permission switches, so the one-time grant needs a person, and Screen
   Sharing is how you reach the Mac's screen from elsewhere.
2. **Grant the permissions through Screen Sharing.** Open Settings → Devices → (the Mac) → Access
   in Haus on any machine for the steps and the bundle path. On the Mac itself, in System Settings →
   Privacy & Security, allow Haus Computer for System & App Protection Override (27.3 and later) and
   Screen & System Audio Recording. Haus rechecks when you come back to the App, or press **Check
   again**.
3. **Fit a display or an HDMI dummy plug.** An Apple silicon Mac with nothing attached may have no
   display outside a Screen Sharing session, and screenshots then fail.
4. **Turn on automatic login** (System Settings → Users & Groups; it needs FileVault off). Haus
   Computer is a LaunchAgent and runs only while its user is logged in, so after a reboot without
   auto-login every command is refused "nobody is logged in".
5. **Never sleep.** System Settings → Energy: prevent automatic sleeping and turn off "Put hard
   disks to sleep". Haus holds the display awake only while an act command runs and wakes a
   sleeping display first, but it can't wake a Mac that is asleep. There is no Keep awake setting.
6. **Choose a lock policy.** A locked screen refuses every command, look or act, with "the screen is
   locked; ask @you to unlock it". If Captains should work unattended, set "Require password after
   screen saver begins or display is turned off" to a long delay or Never, and keep the screen saver
   off. Fast user switching to another account also refuses until you switch back.

Stop Agent Input on the Device page works from any machine, because Stop goes through the Server.

---
summary: App Store Connect setup and the durable TestFlight contract for the Haus iPhone target.
read_when:
  - preparing or promoting a Haus iOS target
  - signing, archiving, or uploading a Haus iOS build
  - changing the iOS bundle identifier, entitlements, version, build number, or App Store metadata
---

# iOS TestFlight

Haus iOS uses bundle identifier `chat.haus.ios`, independent SemVer, and a positive integer
build number that increases for every upload. The app embeds one extension,
`HausNotificationService` (`chat.haus.ios.NotificationService`), which presents pushes as
communication notifications with the sender's avatar. Both bundles share one version and build:
`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` are project-level settings. The checked-in XcodeGen project is canonical. The
shared `assets/mac-icon.icon` Icon Composer source supplies the iPhone and App Store icon.

## One-time Apple setup

Before the first upload, an Account Holder, Admin, or App Manager must:

1. Accept pending App Store Connect agreements.
2. Register the explicit App ID `chat.haus.ios` and enable Associated Domains for
   `webcredentials:clerk.haus.chat`, Push Notifications ([iPhone Push](ios-push.md)), and
   Communication Notifications. Saving a capability change invalidates the App ID's profiles;
   regenerate **Haus CI App Store** afterwards.
3. Register the explicit App ID `chat.haus.ios.NotificationService` (description "Haus
   NotificationService") with no capabilities.
4. Create or verify the **Haus Chat** app record (Apple ID `6810799017`) with that bundle ID and
   SKU `haus-ios`. The installed display name is Haus; Apple has already allocated the bare
   Haus store name to another application. Existing Haus installations require a fresh install.
5. Create the active App Store provisioning profiles **Haus CI App Store** for `chat.haus.ios`
   and **Haus CI App Store NotificationService** for `chat.haus.ios.NotificationService`, both
   with the Apple Distribution certificate. CI looks each up by exact name and bundle ID and fails
   the release when either is missing, expired, or ambiguous.
6. Configure a team App Store Connect API key with Developer access and Certificates, Identifiers &
   Profiles access. CI uses it to read the existing profiles and upload builds, never to create or
   mutate signing resources.
7. Add TestFlight beta details, including feedback contact, sign-in/review instructions, and what
   testers should exercise.
8. Create or verify the **Haus Internal** TestFlight group and its automatic distribution.

The App Store product page also needs a privacy policy URL and age rating before public App Review.
Internal TestFlight does not require screenshots; a public submission does.

## Version and build identity

The release record is the source of the published iOS marketing version and build number. `bun run
release:sync-versions` copies the latest published iOS identity into the `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION` defaults in `project.yml` and its generated Xcode project. The iOS target
job still passes the selected record's explicit values to `xcodebuild`, verifies the generated
project is current, and never uses a CI run number as the build number.

Every upload consumes its build number, including an upload that later fails processing or belongs
to a release that stops. A replacement upload uses a new number and a new append-only release
record or attempt according to the release record contract.

## Target publication and promotion

When `ios` is `publish`, the single `Release` workflow runs the iOS target job after the release PR
merges. The repository contains the compiled catalog in `assets/ios-icon`: the app icon plus the
`LaunchGhost` launch image from `apps/ios-swift/Sources/HausApp/Launch.xcassets`. The archive
excludes both catalog sources and installs this one `Assets.car`, so an image that is not in it never
ships. Its manifest records both source digests, the exact Xcode compiler build, and every output
checksum. Source and artifact drift fails the release tests. Regenerate it with `bun run
ios:prepare-icon` whenever the icon or the launch catalog changes.

The stable-Xcode job verifies that the catalog contains the authored light, dark, tinted, specular,
and 1024px icon renditions and the light and dark launch image, and that its checksum-bound Icon Composer source keeps an active refractive
layer. Stable `assetutil` releases do not all expose preview refraction metadata with the same
schema, so the source/artifact binding carries that part of the proof. The job excludes the source
`.icon` from older `actool` and installs the committed catalog during the archive before signing.
The canonical Info.plist owns the matching icon metadata so Xcode's later plist processing cannot
erase it. The artifact remains a compiled form of the canonical source, not a flattened fallback.

The stable job signs, archives, and uploads the exact version/build pair. Automatic signing uses
Apple Development for the archive. CI then downloads the one active **Haus CI App Store** and
**Haus CI App Store NotificationService** profiles, exports the archive with both and Apple
Distribution, and uploads the resulting IPA with Apple's `altool`. Before upload it asserts the IPA
embeds `PlugIns/HausNotificationService.appex` and that the app is signed with
`com.apple.developer.usernotifications.communication`; a profile regenerated without the
capability would otherwise strip it silently and banners would fall back to the plain app icon. This avoids cloud-signing mutation permissions and requires no local Mac or
TestFlight browser login. After upload, the job polls Apple's read-only build API for up to five
minutes and writes the exact observed processing state to its summary. The job does not invite
testers, change TestFlight groups, or submit the app for public App Review.

If the read-only status probe is temporarily unavailable after upload, do not rerun the upload job:
the build number is already consumed. Retry only `bun run ios:status <version> --build-number
<number>` through the approved Tooling environment and record the resulting evidence.

The **Haus Internal** group automatically distributes new processed builds. Routine internal
releases therefore require no per-build group assignment or **What to Test** edit. `VALID` proves
that Apple processed the uploaded build; it does not prove tester distribution, and the Developer
API key intentionally cannot mutate or inspect beta-group membership.

Manual operator action is exceptional. Request it only when Apple reports failed processing or an
export-compliance warning, or when a processed build is observed not to auto-distribute. A real
iPhone smoke of sign-in, Server discovery, Chat send and realtime receive, photo attachment, Thread
reply, and foreground recovery is useful release verification, but absence of that optional proof
does not turn a routine internal release into an operator blocker.

TestFlight builds expire after 90 days. Never reuse a build number.

## Privacy manifest

`apps/ios-swift/Sources/HausApp/PrivacyInfo.xcprivacy` ships at the app bundle root. It declares no
tracking and the required-reason APIs the app binary uses, including statically linked packages:
`UserDefaults` (CA92.1), file timestamps of the attachment cache inside the app container (C617.1),
and system uptime for in-app timers (35F9.1). Its collected data types cover what the Haus Server
stores for app functionality: messages, photos, other attachments, name, email address, and user
ID. Keep the App Store Connect privacy answers consistent with it. The Notification Service
extension references no required-reason API and carries no manifest; re-check its binary with
`nm -u` when it gains code. Clerk iOS 1.2.0 ships no manifest of its own; its telemetry runs only
against development Clerk instances.

## Credentials

Keep Apple credentials, certificates, provisioning profiles, and App Store Connect `.p8` keys out
of the repository. The profiles remain in Apple and CI downloads their current bytes at release time;
1Password Tooling holds only the signing p12/password and API key material. Use the approved release
environment for the target job; a local operator may be required for account setup or an explicitly
manual Apple action. Do not place any credential in release metadata, changelog text, or the handoff.

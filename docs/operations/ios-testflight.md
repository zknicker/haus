---
summary: App Store Connect setup and the durable TestFlight contract for the Haus iPhone target.
read_when:
  - preparing or promoting a Haus iOS target
  - signing, archiving, or uploading a Haus iOS build
  - changing the iOS bundle identifier, entitlements, version, build number, or App Store metadata
---

# iOS TestFlight

Haus iOS uses bundle identifier `chat.haus.ios`, independent SemVer, and a positive integer
build number that increases for every upload. The checked-in XcodeGen project is canonical. The
shared `assets/mac-icon.icon` Icon Composer source supplies the iPhone and App Store icon.

## One-time Apple setup

Before the first upload, an Account Holder, Admin, or App Manager must:

1. Accept pending App Store Connect agreements.
2. Register the explicit App ID `chat.haus.ios` and enable Associated Domains for
   `webcredentials:clerk.haus.chat` and Push Notifications ([iPhone Push](ios-push.md)).
3. Create or verify the **Haus Chat** app record (Apple ID `6810799017`) with that bundle ID and
   SKU `haus-ios`. The installed display name is Haus; Apple has already allocated the bare
   Haus store name to another application. Existing Haus installations require a fresh install.
4. Create the active App Store provisioning profile **Haus CI App Store** for the Haus App ID
   and Apple Distribution certificate.
5. Configure a team App Store Connect API key with Developer access and Certificates, Identifiers &
   Profiles access. CI uses it to read the existing profile and upload builds, never to create or
   mutate signing resources.
6. Add TestFlight beta details, including feedback contact, sign-in/review instructions, and what
   testers should exercise.
7. Create or verify the **Haus Internal** TestFlight group and its automatic distribution.

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
merges. The repository contains the compiled catalog in `assets/ios-icon`. Its manifest records the
canonical `.icon` source digest, exact Xcode compiler build, and every output checksum. Source and
artifact drift fails the release tests. Regenerate it with `bun run ios:prepare-icon` only when the
icon source changes.

The stable-Xcode job verifies that the catalog contains the authored light, dark, tinted, specular,
and 1024px renditions, and that its checksum-bound Icon Composer source keeps an active refractive
layer. Stable `assetutil` releases do not all expose preview refraction metadata with the same
schema, so the source/artifact binding carries that part of the proof. The job excludes the source
`.icon` from older `actool` and installs the committed catalog during the archive before signing.
The canonical Info.plist owns the matching icon metadata so Xcode's later plist processing cannot
erase it. The artifact remains a compiled form of the canonical source, not a flattened fallback.

The stable job signs, archives, and uploads the exact version/build pair. Automatic signing uses
Apple Development for the archive. CI then downloads the one active **Haus CI App Store** profile,
exports the archive with that profile and Apple Distribution, and uploads the resulting IPA with
Apple's `altool`. This avoids cloud-signing mutation permissions and requires no local Mac or
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

## Credentials

Keep Apple credentials, certificates, provisioning profiles, and App Store Connect `.p8` keys out
of the repository. The profile remains in Apple and CI downloads its current bytes at release time;
1Password Tooling holds only the signing p12/password and API key material. Use the approved release
environment for the target job; a local operator may be required for account setup or an explicitly
manual Apple action. Do not place any credential in release metadata, changelog text, or the handoff.

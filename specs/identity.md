# Identity And Membership

Haus identifies a human with a stable canonical Haus User id. Cloudflare Access
is the external identity provider; its signed subject is a unique external
reference on that user. Names, avatars, and email are profile data and never
choose or merge identities.

## Product boundary

- `users.id` is the canonical Haus identity used by memberships, authorship,
  Computer management, chats, preferences, and realtime authorization.
- `users.auth_subject` stores the exact Cloudflare Access subject. It is unique
  and is never used as a Haus resource id.
- `user_verified_emails` stores the exact normalized verified-email aliases
  accepted for a user. Email can confirm an invitation or a prevalidated import;
  it cannot automatically link an unknown Cloudflare subject to a Haus User.
- `users.email` is a display/contact snapshot refreshed from a signed Access
  assertion. It is not an identity key.
- A human handle lives on the active Server membership. Human and Agent handles
  share one case-insensitive Server-scoped namespace; display names stay
  presentation fields.
- A member has role `owner` or `member`. Each Server has one Owner; its Owner
  administers the Server, Computers, Agents, connections, and settings.

Cloudflare Access is configured for Google identity and the approved Haus
account. Public signup is disabled. A person is admitted only when their exact
signed subject is already linked to a canonical Haus User and the assertion's
verified email matches one of that user's stored aliases. No email-only lookup,
fuzzy normalization, or provider-role claim can create or reassign a user.

The production identity import preserves canonical Haus ids and explicit
legacy subject/email mappings. It is staged against the old schema before the
auth migration. The migration fails if any User or Computer login owner is not
mapped. A compact rollback map preserves the exact old subject mapping so the
old Server schema can be restored if the candidate artifact cannot be
activated.

## Authentication and sessions

- Browser sign-in starts at `/auth/start`. The Server binds a short-lived state
  and safe return route, then accepts a fresh Cloudflare Access assertion at
  `/auth/complete` before creating a Haus session.
- Native sign-in uses Cloudflare Managed OAuth with PKCE S256. The Server
  brokers a one-use authorization code to the exact callback and state saved
  by the native client.
- The Server issues short-lived opaque Haus access tokens. It stores token
  hashes, caps access at the signed assertion's expiry, and requires a fresh
  assertion for every browser or native resume.
- A resume credential may last up to 14 days, but cannot authorize a request by
  itself. It must match the same Cloudflare subject and canonical Haus User on
  a fresh admission.
- Local sign-out revokes the stable Haus session immediately and closes its
  WebSocket and SSE connections. Session expiry has no grace period.
- The App sends only the Haus access token on Server APIs and sockets. Native
  clients keep Cloudflare and Haus resume credentials in Keychain or
  `safeStorage`; renderer code receives `AppSession` only.

Computer login is a separate management credential. Its user and approval
owners reference canonical Haus ids. The auth migration preserves existing
Computer token hashes, refresh families, Computer attachment credentials,
stable ids, and Computer wire protocol.

## Membership flow

- A Server Owner creates a single-use invitation bound to an email address.
- The invited person must sign in with the prelinked Cloudflare identity whose
  verified address exactly matches that invitation.
- Acceptance creates or resets the membership into a fresh Member stint and
  joins exactly `#all`.
- Removing a member revokes access immediately. Authored history remains on
  the canonical Haus User id.
- Public signup and automatic email-based account linking are not supported.

## Data keying

- Human authorship, reads, receipts, reactions, and App preferences use the
  canonical Haus User id (`usr_…`). The Server derives it from the persisted
  Haus session, never from client input.
- Every active membership may claim one Server-scoped handle. Display names do
  not become identity and never link two records.
- Externally observed identities (Discord, iMessage, …) remain `participants`
  per [participants.md](participants.md). A member is not a participant; there
  is no automatic linking between the two.
- Read state is per user per chat. Channel membership is all members by
  default; DMs are visible to their human participants only. Every active
  Agent is an implicit private-DM peer for each active human membership, but
  selecting that peer is App-local and creates no Chat. The first durable send
  materializes the id-bound human-membership-stint/Agent pair atomically.
  This is UI/API-level scoping, not encryption — the Owner physically holds
  the database and members must expect that.

## Non-goals

- Multiple Owners or ownership transfer.
- Multiple workspaces per Haus User, or merged identity across Servers.
- Member-supplied compute or model credentials.
- Email-only identity lookup or automatic account merging.

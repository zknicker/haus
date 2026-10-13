---
summary: Computer Secrets — the Server Owner connects one 1Password vault per Computer from the desktop App, and every Agent on that Computer reads it through `haus-secrets`.
read_when:
  - changing Computer settings → Secrets, Connect 1Password, Refresh items, or Disconnect
  - changing the desktop `op` bridge (`apps/website/electron/onepassword*.cjs`)
  - changing how a 1Password token or item list travels from the App to a Computer, or where a Computer stores it
  - changing `haus-secrets`, its Varlock schema, the pinned secrets runtime, or the Agent PATH
---

# Computer Secrets

One 1Password vault is shared by every Agent on one Computer attachment. Only the Server Owner
manages it, from **Settings → Computers → (Computer) → Secrets** in Haus for Mac. The web App shows
the status but cannot connect or refresh, because those steps need the local 1Password CLI.

## Connect 1Password

Desktop main runs the local `op` CLI under 1Password's desktop-app integration, so each call is
approved in 1Password (Touch ID):

1. List vaults. Personal, Private, Employee, and Shared vaults are not offered, because service
   accounts cannot hold them, and names containing `:` or `,` cannot be granted.
2. For the chosen vault, list its items, then create a read-only service account
   (`--vault <name>:read_items`) named `Haus Computer <Computer name> <date>`. Listing first means
   a failure leaves nothing to revoke.

Item listing keeps API Credential (field `credential`), Password, and Login (field `password`)
items as `{ id, title, field }`, at most 200. Values never leave 1Password on this path.

The renderer passes the token, item list, account, vault, and service account name straight to
`computerSecrets.connect` through the vanilla tRPC client, never a cached mutation. Server checks
that the caller is the Owner and the Computer belongs to the Server, then relays one
`computer-secrets-request` frame on the Computer attachment socket. Server holds the token only in
memory for that relay; it is not written to PostgreSQL, traced, or logged.

## On the Computer

The Computer never needs the `op` CLI. On connect it:

1. Installs the pinned secrets runtime (`varlock` and `@varlock/1password-plugin`, versions
   matching the root `package.json`) into `<data root>/servers/<serverId>/secrets/` from the
   manifest and lockfile embedded in the Computer binary (`apps/computer/assets/secrets-runtime/`).
   The install uses the same pinned pnpm and machine-wide store as the harness bridges, so it needs
   Node.js 22+ with corepack on PATH, which bridges already require. A fingerprint marker skips a
   matching install. If the install fails, nothing is stored and Connect reports the error.
2. Stores the token in the login macOS Keychain (service `haus.computer.1password`, account = Server
   id) via `security -i`, so it never appears in argv.
3. Writes `schema/.env.schema`, `bin/haus-secrets`, and `state.json`. None carries the token.

The schema initializes the plugin with the token and `allowAppAuth=false`, which selects the
plugin's 1Password SDK (WASM) mode; `useCliWithServiceAccount` is never set. Varlock finds the
plugin in the `node_modules` beside the schema. Items are referenced as
`op://<vault id>/<item id>/<field>`, so titles cannot break a reference.

## Status

Computer reports `inventory.secrets` in its ordinary report: connected or not, account, vault,
item env names and titles, service account name, and `issue: 'runtime-missing'` when the Varlock
install is gone. Settings reads this Server-reported state, so it stays visible while the
Computer is offline. Values never leave the Computer.

## Refresh items

A newly added or renamed vault item needs **Refresh items** in the Secrets row's **⋯** menu (desktop
App, Computer online). Desktop main lists the connected vault's items again, and
`computerSecrets.refreshItems` relays the new list with the vault id. Computer rejects a vault
id that does not match its connection, rewrites the schema, wrapper, and state, and reinstalls the
runtime if it went missing. The token and service account are unchanged.

## Agent use

`haus-secrets` is on every Agent's PATH. Agents learn it from the `secrets` Manual topic.
`haus-secrets --list` prints the env names; `haus-secrets -- <command>` reads the token from the
Keychain, exports it only into the `varlock run --inject vars` process it execs (with Varlock
telemetry off), and Varlock injects each item into the command while stripping the `@internal`
token. Piped output is redacted by Varlock.

Agents run as the same OS user without isolation, so this reduces leaks; it is not a boundary.

## Disconnect

**Disconnect 1Password** in the **⋯** menu confirms first. The Computer deletes the Keychain item
and the whole secrets directory. 1Password's CLI has no command to delete a service account, so
the confirmation and the success toast name the service account to delete on 1password.com under
Developer → Service Accounts.

## Protocol

Computer protocol 30 adds the `computer-secrets-request` and `-result` frames and the inventory
`secrets` field. Connect and refresh wait up to 120 seconds for the Computer (its install gives up
at 110), disconnect 30.

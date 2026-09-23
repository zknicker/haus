---
summary: React ownership and implementation conventions for routes, features, hooks, components, shell composition, forms, and realtime subscriptions.
read_when:
  - changing React file layout, shared UI ownership, frontend hooks, or presentation helpers
  - changing route structure, loading behavior, hooks, or component boundaries
  - reviewing React data ownership, Suspense usage, or presentation state
---

# React

Before changing React structure, behavior, data flow, or state, use the
`architect-react-features` skill alongside this doc.

## Change Workflow

1. **Trace ownership before editing.** Use `architect-react-features` to locate
   the route boundary, data reads, mutations, subscriptions, local state,
   effects, props, optimistic state, and cache owner affected by the request.
2. **Select composition rules when the component contract changes.** Use
   `vercel-composition-patterns` when changing component APIs, props,
   providers, context, shared state, reusable UI, or render variation. Read
   every matching rule from that skill before choosing the new shape.
3. **Complete the product change.** Delete the replaced path; finish the
   requested behavior and cleanup.
4. **Audit the completed diff before verification.** Reapply the relevant skill
   audits. Confirm that data-aware leaves use focused hooks, props describe
   identity or genuine render variation, context owns shared UI behavior,
   effects synchronize external systems, variants are explicit, and cache
   updates have one owner.
5. **Verify after the architecture is settled.** Use
   [Change Routing](../operations/testing.md#change-routing) to select the
   smallest proof from the completed diff.

Lift state or introduce a provider only when sibling regions genuinely share
UI behavior or one external lifecycle. Composition guidance does not override
Haus's data ownership: durable server state stays in React Query, data-aware
leaves call focused hooks, and context does not distribute a fetched data
graph.

## Ownership

The frontend is organized by capability:

| Area | Owns |
| --- | --- |
| `routes/` | Thin route entrypoints and route-level boundaries |
| `features/` | Page and workflow composition plus feature-local state |
| `commands/` | Global command definitions grouped by product capability |
| `components/` | Reusable presentation owned by a product capability |
| `hooks/` | Reusable data, mutation, and event capabilities |
| `lib/` | Non-React formatting, view models, and boundary adapters |

Promote reusable chat, Agent, task, reminder, or stats code to its matching
capability. Avoid generic `shared`, `common`, `helpers`, and `misc` buckets when
a product owner exists. Prefer short names scoped by folders.

Presentation contracts belong to the App capability that renders them. Server
adapters project first-party `@haus/api` results into those contracts at the
feature boundary. App components and presentation helpers must not import a
Server router or transport-specific response type merely to share a row, actor,
composer, or drawer model.

## Routes

### Loading and navigation

`ActivationFrame` lives above `RouterProvider` and owns the activation chrome and animated ghost.
`ActivationShell` portals only step content and topbar slots into that frame; portals retain the
calling screen's auth/query context. Do not put another ghost in a loading or setup branch, key the
frame by identity/route, or hide it with `display: none`, which resets its animation clock. The frame
uses scene presence to control visibility and interaction, without copying query data into context.


Keep the destination shell mounted while its first snapshot resolves. An unresolved query is not
an empty collection: reserve a neutral data region until the query settles, and show an empty state
only after a successful empty result. Keep surrounding navigation and page structure mounted, but
do not add loading decoration for ordinary fast reads. When cached data exists, keep it visible
through background refreshes instead of replacing the page with a loading state. Durable synced
queries should use the shared synced-snapshot query policy so ordinary back-and-forth navigation
reuses the latest local snapshot while realtime invalidations refresh it.

Profile loading follows the same rule. Human profiles reserve identity facts and load Created
Agents independently. Profile settings keeps Identity rows and Account actions visible while
the member directory resolves, with identity inputs disabled until the real member arrives.
Computer profiles reserve their named sections during the first roster read. The Agent peek
keeps its header, Close, and Open profile controls outside its Agent query boundary.

* Keep route files thin.
* Let route/page boundaries own `Suspense`, skeletons, and error boundaries.
* Keep primary page content mounted during background refreshes.
* Keep the authenticated Server shell mounted across Clerk token rotation and
  websocket reconnects. Transport credentials and connection generations must not
  become React keys. Only a genuine human identity change may clear hosted query
  ownership or replace the authenticated surface; key that identity-owned provider
  by the known Clerk user id rather than clearing a shared cache after render.
* Keep primary Server destinations code-split, but share their cached module
  loaders between router navigation and preloading. The persistent shell warms
  them while idle; sidebar-row hover warms the destination before selection.
  Channel and existing DM rows also warm Chat detail and paginated history on
  hover or keyboard focus. Preloads use the mounted query's options and cache,
  retain loaded history pages, and respect realtime invalidation. An implicit
  DM only warms route code; navigating or preloading must not create a Chat.
* Treat empty synced database results as valid rendered states.
* Keep `/s/*` on the Haus Server route tree. It may mount Server hooks and
  Computer-backed capability surfaces, but it must not invent direct execution
  runtime routing or use Electron IPC for product data.

## Shell

* `ServerLayout` owns the stable `AppLayout` scaffold and one persistent
  `ShellSidebar` — there is no icon rail. Every surface reserves a titlebar
  strip at the top of the sidebar, held by `SidebarTitlebarStrip`, and where
  the Haus ghost sits is the sidebar's one platform fork. On the web the mark
  leads that strip, where a product's wordmark would sit, and the Inbox row
  wears the inbox glyph like every other navigation row. On the macOS desktop
  the traffic lights already lead the strip, so the strip carries only the
  settings gear and the mark stays on the Inbox row. On the web the strip's mark is a link to the
  Inbox — the way home a wordmark in a product's corner is, with no hover
  treatment and a real tab stop — and the ghost inside it stays `aria-hidden`
  so the link carries the name. That name is "Haus", the product mark and the
  breadcrumb's leading crumb, not its destination: the Inbox navigation row
  sits just below it with the same href, and two adjacent tab stops named
  "Inbox" is one name too many.
   the Inbox row's own mark on the macOS desktop
  is the row's icon and nothing more. Either way the mark carries a slowly
  drifting mesh gradient that moves a little faster while any Agent is
  working.
  `ShellSidebar` resolves the surface once from the `macos-electron` class
  `main.tsx` stamps on the root (`resolveSidebarSurface`) and publishes it as
  context (`useSidebarSurface`); `shell.css` forks on the same class, and
  nothing else reads it. The navigation below leads with the Inbox row, first
  in the Inbox/Search/Tasks menu, and chat navigation follows; the footer holds
  live Agent activity above the bottom-pinned desktop update status. The gear
  takes no row of its own: `resolveSettingsActionSlot` derives from the same
  surface and keeps the footer's trailing end wired as the other slot, so the
  gear's DOM position matches where it is drawn.
  A sidebar page's first navigation row is offset by half the shared
  `--app-shell-band-height` band — Inbox in chat navigation, the back-to-chat
  row elsewhere — so its midline meets the content topbar's across the divider
  while the menu's own pitch continues underneath; the row keeps HeroUI's own
  height, fill, and end padding. The column starts below the titlebar strip on
  every surface — that is where the gear lands, beside the traffic lights on
  macOS — and the strip plus that offset is the navigation's clearance under
  them, so the lead row's midline sits one strip below the content topbar's
  everywhere, by construction. Only the strip's value is declared per platform
  (`--app-shell-titlebar-inset`, `shell.css`); the web currently takes the same
  one. The Inbox page fills the band like every other routed
  destination: the page's own glyph and its breadcrumb trail, in Settings' own
  band shape, and nothing at the trailing end. Every band's trail leads with a
  "Haus" crumb linking back to the Inbox: the Inbox band reads Haus › Inbox,
  and Settings reads Haus › Settings › page (› record). Its column is stock,
  so the greeting opens under the band at the page's ordinary top inset on
  every surface. Switching,
  creating, and joining Servers live under Settings → Servers, not in the
  sidebar. Sections compose `ShellSidebarPage` slots; route state
  selects one slot without replacing the sidebar root, and non-chat pages
  render a shared back-to-chat row. The sidebar is persistent — every routed
  destination, search included, keeps it mounted.
  Returning to Chat resolves the remembered valid Chat directly instead of
  rendering the Server entry redirect between section destinations.
* `ShellSidebar` mounts only the active page descriptor. Left-sidebar changes
  are navigation, not disclosure, so they are instant and inactive page controls
  never enter the accessibility tree. Routes that add or remove the contextual
  left sidebar also reflow immediately; right-side chat panes retain their own
  open and close motion.
* The shell renders one `ShellTopbar`. Pages compose its content through
  `PageTopbar` and `SectionHeader`. Embedded surfaces use `SectionBar`.
* Routed destinations render their content inside one `PageColumn`, which owns
  the page gutter, max width, and the rhythm between sections. It encodes
  HeroUI's page idiom (`mx-auto flex w-full flex-col gap-8` plus page padding)
  against the generated `--spacing` token, so a design-system change rescales
  every page together. Every destination shares its one `max-w-6xl` measure —
  per-page width variants made sibling pages visibly different widths one
  click apart; do not reintroduce them or a call-site `max-w-[…]` override.
* Two shapes mean a HeroUI component is being replaced rather than composed:
  a layout element dropped straight into a compound header or footer, and a
  `className` that cancels a component's own padding or gap. Both typecheck and
  both produce real visual bugs — a `Form` wrapped around `Drawer.Header`/`Body`/
  `Footer` unpinned the footer; a flex row inside `Modal.Header` stranded the
  icon, because that header stacks Icon over Heading over one muted line; and
  `<Card className="gap-0 p-0">` is how a whole parallel settings row kit began.
  The first shape is enforced by the Biome plugins in `apps/website/lint/`, the
  second by `lib/heroui-composition-contract.test.ts`. Neither sees a `className`
  built through `cn()` or a variable, so read the component's anatomy before
  reaching for a wrapper.
* One Settings page separates **Preferences** (Profile, Preferences, Servers)
  from **Server** (Server, Members, Connections, Models, Skills, then Usage and
  Archived chats), followed by the roster-driven **Computers**. Agent
  capabilities belong to the shared Server scope, not a separate settings
  category. Which Servers you belong to is about you, so switching, creating,
  and joining sit in the personal scope. Usage and Archived chats are
  link-outs, not settings pages: they keep their own standalone routes and the
  rail hands off to them (`settingsNavLinkItems`, resolved by
  `SettingsSectionRoute`). Browser controls live on each
  Computer; the former Browser URL redirects there. Back is a stock
  `Sidebar.Group` inside the same `Sidebar.Content` as the settings rows.
  `features/settings/layout/navigation.ts` is the source of that grouping and
  `navigation.test.ts` guards it. File new settings by who they affect: the
  reader, the shared Server, or a Computer. A setting whose subject
  is you belongs in Preferences even when it is reached through a Server-scoped URL
  (Settings is mounted under `/s/:slug`, so device and user settings repeat per
  Server; that is a known wart, not a licence to file them under Server).
  Page titles match their sidebar labels, including Server and Skills. Computer
  titles use the same Computer name as the sidebar; health belongs in metadata.
* **An Agent has its own page; a human is a record in Settings.** Agents are
  first-class product records, so an Agent's page renders in the Server layout
  at `/s/:slug/agents/:agentId/:tab` (`routes/app/agent-page.tsx`) and keeps the
  app's own navigation. Humans stay roster records under Settings → Members at
  `settings/members/humans/:userId`. The old `settings/members/agents/…`
  addresses redirect to the page; there is no second route for the same record.
* **Navigating goes to the page, peeking opens a pane.** Clicking an Agent's
  avatar in chat opens a read-only peek pane beside the message
  (`hooks/pane/use-agent-profile-pane.ts`): one column, no tabs, and its only
  path to editing is its **Open profile** action. Every other surface — the
  Inbox's live Agent rows, the chat-rail context menu, the Computer page's Agent table,
  the command palette — navigates to the page.
* Usage is a dashboard, not a member. It lives at `/s/:slug/usage` — it was the
  index of the deleted `/members` browser, which made a dashboard wear a
  roster's URL.
* A preference is a row with a control, not a page. Theme is a `Select` in
  Preferences, not three window mockups on a route of its own — a value with
  three options does not earn a destination, and it has to survive that list
  growing. Give a preference its own page only when it has state to show beyond
  its own value.
* Settings-style surfaces compose stock Pro parts, not a local row kit — the
  `SettingsSection`/`SettingsGroup`/`SettingsItem` kit that used to sit in
  `features/settings/layout/` is gone, and `settings-page-header.tsx` now holds
  only `SettingsPageHeader`. That kit was a parallel implementation of
  `ItemCardGroup`/`ItemCard` and drifted from them on heading size, row padding,
  and left edge; every surface it served (agent profile, human directory,
  created agents) is stock now. Do not reintroduce one. A
  section is `ItemCardGroup variant="transparent"` with `Header`/`Title`; a row
  is `ItemCard` with `Content`/`Title`/`Description`/`Action`, separated by
  `Separator`; tabular data is `DataGrid` with a typed column array. The
  Computer overview (`features/computers/`) is the worked reference for all
  three. `ItemCard.Action` is intrinsic-width, so a row never declares a
  trailing-column width; a wide control carries its own measure.
  `features/settings/layout/settings-text.tsx` holds the only two roles
  `ItemCard` has no slot for — a read-only value and a row's action error.
* A dialog or drawer body is the same row kit, not a stack of labeled form
  fields. `Modal.Header`/`Drawer.Header`/`Sheet.Header` carries an icon, the
  name, and one muted line; everything the surface reports or changes below it
  is `ItemCardGroup` sections of `ItemCard` rows. A fact is a title plus a
  `SettingsFact` in `ItemCard.Action`; a row that acts carries one small button
  and nothing else, so the body never grows a second button style beside the
  footer pair. Prose that is read once — what a profile is, what a caller does
  with a URL — sits behind a ghost info-icon `Tooltip` next to the row title,
  and `ItemCard.Description` is kept for the one clause a destructive row owes
  the reader. A failed action is `SettingsRowError` at the end of the body, not
  a boxed `Alert`: an Alert outweighs every row it sits under.
* Controls sit at the altitude they act on. A page-level action goes in the
  shell band through `PageTopbar` + `SectionHeader` with no title; a control
  scoped to one section rides in that section's `ItemCardGroup.Header`; a
  control acting on one row lives in that row's `ItemCard.Action`.
  `SettingsPageHeader` carries identity only — a title with either a
  description, a `meta` identity line, or an `aside` of the record's
  facts — and takes no action slot.
* Empty states have exactly three shapes, by surface. A full pane or
  page-level empty/error is stock `EmptyState` with `Media variant="icon"`
  (inside a `Card` when it stands in for a card the data would have filled —
  `UsageEmptyCard`, the token grid). An empty *list* keeps its section header
  and shows one quiet `ItemCard` row with a description ("No reminders
  yet.") — unless that header already says the same thing, in which case the
  section is its header alone and no list box is drawn at all (Members →
  Invitations, whose header carries both the count and the way to add one). A
  transient surface (popover, drawer, menu) uses one muted inline
  line. Never hand-roll an icon box or a centered paragraph stack — two
  drifted copies of `EmptyState` have already been paid for and deleted.
* Spacing has one owner per axis. HeroUI modules — `Widget`, `ItemCardGroup`,
  `Card`, `KPI` — already carry their own header and content padding, so drop
  them straight into the column instead of wrapping them in padded `<section>`
  elements. Adding padding to both a parent and its child is what drove page
  rhythm to 15px on one destination and 40px on another.
* `SectionBar`'s horizontal padding matches `PageColumn`'s so a band title and
  the content beneath it share one left edge. Change them together.
* Chat is deliberately exempt from `PageColumn`: it is a full-height surface
  with its own scroll and composer geometry, not a document column.
* Chat side panes portal into the shell-level side-pane slot so their header
  sits beside the chat topbar and their body spans the full app content height.
  Pane state and content remain owned by the active chat. Every pane kind uses
  `ChatSidePaneShell` for width and motion; panes with local drafts stay mounted,
  inert, and accessibility-hidden while another pane temporarily owns the slot.
  Keep the pane shell's identity stable when its selected target changes; key
  target-specific content below the shell instead.
* Shell chrome, traffic-light clearance, topbar height, and panel seams belong
  to the shell components, not feature pages.
* Global command definitions live under `src/commands`; the shell only renders
  their groups.
  Cmd+K includes Light, Dark, and System theme commands using the same device-local
  theme preference as Settings.

## Hooks

* Wrap tRPC React Query calls in capability hooks.
* Keep hooks narrow and data-first.
* Promote reusable hooks to `src/hooks/<capability>` once ownership is clear.
* Colocate feature-only hooks with the feature.
* Keep durable server state in React Query. Use scoped context or a tiny feature
  store only for volatile UI state that has not become durable server data.
* For chat and other streaming surfaces, patch exact volatile state from live
  events. Do not refetch durable list or log queries for every progress token.
* Effects are for external synchronization, not derived state.
* Chat hooks keep messages, lists, reads, and search in React Query.
  Durable reconnect events trigger cursor catch-up plus exact invalidation;
  composition events stay component-local and are discarded on unmount.
  Selected attachment `File` objects stay composer-local; durable messages
  retain only attachment metadata, and authenticated byte transfer stays in
  focused attachment hooks.
* Attachment hooks reserve metadata over tRPC and transfer bytes directly
  against the app origin with a fresh Clerk token. Do not convert
  attachment bytes into message-query data.

## Queries

* Name APIs as `<namespace>.<verb>` unless a narrower exception is clearer.
* Make `*.list` the normal lightweight list read for a namespace.
* Use focused `*.get` reads for detail screens.
* Invalidate list reads for membership or ordering changes.
* Invalidate detail reads for single-record changes.

### Query Policy

Server events own cache invalidation; `staleTime` is only the fallback floor.
The contract is executable in
`apps/website/src/lib/query-policy-contract.test.ts` — do not widen its
allowlists to make it pass.

* Every `useQuery` declares a named `queryPolicy` preset from
  `lib/query-policy.ts` (or an explicit `staleTime` with a stated reason).
  Both tRPC clients share a 30s default `staleTime` floor so an unpoliced
  one-off query cannot refetch on every mount.
* Event listener hooks are the single invalidation owner for their namespace.
  Mutations do not re-invalidate what a durable event already covers; at most
  they keep one narrow un-awaited invalidate as an ack fallback.
* Listeners branch per event type and invalidate only the queries whose
  rendered payload the event changes. Ground new branches in what the list
  procedure actually returns, not in what sounds related.
* One listener hook per event type owns that event's invalidation, and those
  hooks mount together behind their stream's transport. The transport owns the
  subscription, the cursor, the burst window, and reconnect catch-up, and hands
  each listener its own events; it maps nothing to a query itself. Adding an
  event type means adding its listener hook, not another branch in a shared
  switch. See `hooks/servers/chat-events/`.
* Open a second wire stream only when the audience or authority differs, never
  to separate concerns.
* When an event names the record it changed, invalidate that record's detail
  read exactly and keep the broad invalidation as the no-id fallback. A
  `server.updated` event carrying `agentId` refreshes that Agent's detail and
  delivery state; one carrying `memberId` refreshes that human's directory
  record. A listener also refreshes only the Server detail it subscribes to,
  never every cached slug. See [Realtime](../api/realtime.md).
* Never set `refetchOnMount: false` on a query that unmounts with navigation.
  Invalidation marks inactive queries stale without refetching them, so the
  stale-gated mount refetch (the React Query default) is what delivers those
  changes on remount.
* Never put a tRPC utils proxy path (`utils.chat.x`) in a dependency array —
  each property access is a fresh object. Depend on the stable `utils` root
  and the memoized input value instead.
* Show user-authored sends as app-local pending rows immediately; do not block
  the composer on server acks or awaited invalidation fan-outs.

## Components

* Keep files small and focused.
* Pass small domain props or local view models, not whole query objects.
* Split large views by responsibility before adding more branching.
* Share reusable rows, badges, grouping helpers, formatting, and view helpers;
  avoid wrapper-only component chains.
* Prefer nested compositional pieces with clear ownership. Routes pass stable
  identity into a feature page. Data-aware leaves call the focused query or
  mutation hooks they need; React Query shares cached reads across those leaves.
  Keep state at a feature root only when multiple sibling regions must coordinate
  it, such as Chat view selection, the active Thread, or one shared realtime
  lifecycle stream.
* Do not fetch a feature's full data graph in a route, place it in context, or
  forward it through controller props. Context is for a stable cross-cutting
  capability, not a substitute for leaf-owned hooks.
* Compose HeroUI compound parts directly. Chat composers use Pro
  `PromptInput.Shell`, `PromptInput.Content`, and `PromptInput.Toolbar`; do not
  recreate a monolithic app-level PromptInput primitive.
* Haus Modals and AlertDialogs set `isDismissable` on their Backdrop so
  clicking outside the dialog acts like Cancel.
* A state-driven overlay starts at `Modal.Backdrop` / `Drawer.Backdrop` and
  carries `isOpen`, `onOpenChange`, and the dismissal props there — HeroUI's
  documented Controlled State shape. The `Modal` / `Drawer` root exists only to
  host a `Trigger`; keeping it around a trigger-less dialog mounts an empty
  React Aria press responder and logs "A PressResponder was rendered without a
  pressable child" for every such dialog on screen.
* Composer `@`/`$` autocomplete and transcript reference rendering belong to
  the mentions capability. See [Rich References](../features/rich-references.md).

### Render stability on synced surfaces

A websocket-driven refetch replaces a whole query result, but a transcript
typically changed one row. React Query's structural sharing hands back the same
record objects for everything the server returned unchanged, so **source-object
identity is the change signal** — hosted chat messages carry no version or
`updatedAt` field to compare.

* View-model projections over synced lists reuse their previous output objects
  for unchanged source records, and return the previous array when nothing
  moved. See `features/servers/chat/chat-message-projection.ts`.
* A render context that reaches rows through React context must hold its
  identity across those refetches, or every row re-renders regardless of how
  stable its props are. Keep event-time lookups behind a latest-value ref, keep
  derived maps content-stable, and give the context stable callbacks from the
  owning feature root.
* Expensive leaf rendering (markdown parsing) memoizes on value, not identity,
  because callers re-derive props such as mentions from the message text on
  every render.

## Styling

* `styles/global.css` owns import order and document defaults only.
* `styles/default-theme.css` and root `DESIGN.md` started as exports from the
  saved HeroUI Pro design system and are now owned in code — the saved system is
  stale. Edit both directly and keep them consistent. `default-theme.css` holds
  the tokens in `:root` and one `@layer components` block of BEM overrides;
  reach for a token first, a BEM override when no token can express it, and a
  call-site class only for a genuine one-off.
* Page, dialog, section, and body text use the four type roles in `DESIGN.md`
  ("Document type roles"). Every step is carried by a stock component or by
  `SettingsPageHeader`; a call site setting its own `text-*` size on a
  HeroUI part is the bug that role table exists to prevent.
* `styles/product-tokens.css` owns only cross-feature product concepts HeroUI
  cannot provide, currently sender differentiation and task-label colors.
* `styles/artifact-tokens.css` is the stable boundary for durable
  agent-authored HTML: a taught vocabulary of 40 role names, and nothing else.
  It is the only contract — renaming or removing a name is a breaking change,
  and a stored visual that references a removed name must be reauthored.
  Product components must not use it. Some published names read a different
  host role in the frame snapshot (`agent-html/tokens.ts`) rather than in that
  file — `--accent-foreground`, `--success-foreground` and
  `--warning-foreground` take HeroUI's `-soft-foreground` values, and
  `--radius` reads the artifact-owned `--radius-control`, so publishing a
  corner cannot reshape Tailwind's own scale. `--chart-1..5` is
  the one deliberate crossover: it is declared globally so `features/stats` and
  agent-authored visuals draw the same categorical palette.
* Feature behavior CSS stays beside its owner, such as chat motion and the
  Electron shell. It must not restyle HeroUI component appearance.
* At HeroUI `Avatar`, `Badge`, and `Chip` call sites, limit classes to layout,
  truncation, and named product semantics. HeroUI owns radius, spacing,
  typography, borders, hover, focus, and motion; do not recreate those styles.
* Use HeroUI semantic utilities directly. Add a custom token only when the
  value represents a durable product concept rather than a component,
  feature implementation, or alternate name for an existing HeroUI role.

## Forms

* For TanStack React Form, treat fetched records as mount-time snapshots.
* Prefer record-load gates, explicit snapshot keys, and field-level bindings in
  leaf components.

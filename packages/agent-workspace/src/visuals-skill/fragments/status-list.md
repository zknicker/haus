# Status list

One row per job: a dot, a label, what happened, when. The dot is never the only
signal — the words say the same thing.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Three of four syncs are current; the metadata pass has not run since 10:06pm last night.</h2>
<div style="display:grid;gap:var(--gap-xs)">
  <div style="display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--gap-sm);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
    <span style="width:8px;height:8px;border-radius:50%;background:var(--success)"></span>
    <span>Sales feed · up to date</span>
    <span style="font-size:12px;color:var(--muted-foreground);white-space:nowrap">6 min ago</span>
  </div>
  <div style="display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--gap-sm);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
    <span style="width:8px;height:8px;border-radius:50%;background:var(--success)"></span>
    <span>Royalty report · 30 days imported</span>
    <span style="font-size:12px;color:var(--muted-foreground);white-space:nowrap">2 hours ago</span>
  </div>
  <div style="display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--gap-sm);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
    <span style="width:8px;height:8px;border-radius:50%;background:var(--warning)"></span>
    <span>Listing metadata · stalled, last pass 10:06pm</span>
    <span style="font-size:12px;color:var(--muted-foreground);white-space:nowrap">10 hours ago</span>
  </div>
  <div style="display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:var(--gap-sm);background:var(--surface-secondary);border-radius:var(--radius);padding:var(--pad-sm) var(--pad-md)">
    <span style="width:8px;height:8px;border-radius:50%;background:var(--success)"></span>
    <span>Ads report · synced</span>
    <span style="font-size:12px;color:var(--muted-foreground);white-space:nowrap">41 min ago</span>
  </div>
</div>
```

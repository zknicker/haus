# Timeline

Top to bottom, one rail, one dot per event. Plain HTML, so the times and titles
are real text at real sizes and a long line simply wraps.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The September sync ran clean until the 10pm metadata pass, which has not landed since.</h2>
<div style="display:grid;gap:var(--gap-md)">
  <div style="display:grid;grid-template-columns:92px 14px minmax(0,1fr);align-items:start;gap:var(--gap-sm)">
    <div style="font-size:12px;color:var(--muted-foreground);text-align:right;padding-top:1px">Sep 12</div>
    <div style="position:relative;height:100%">
      <span style="position:absolute;left:4px;top:5px;width:6px;height:6px;border-radius:50%;background:var(--chart-5)"></span>
      <span style="position:absolute;left:6.5px;top:11px;bottom:-22px;width:1px;background:var(--border)"></span>
    </div>
    <div>
      <div style="font-weight:500">Royalty report imported</div>
      <div style="font-size:12px;color:var(--muted-foreground)">1,450 rows, 30 days</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:92px 14px minmax(0,1fr);align-items:start;gap:var(--gap-sm)">
    <div style="font-size:12px;color:var(--muted-foreground);text-align:right;padding-top:1px">Sep 14</div>
    <div style="position:relative;height:100%">
      <span style="position:absolute;left:4px;top:5px;width:6px;height:6px;border-radius:50%;background:var(--success)"></span>
      <span style="position:absolute;left:6.5px;top:11px;bottom:-22px;width:1px;background:var(--border)"></span>
    </div>
    <div>
      <div style="font-weight:500">Sales feed caught up</div>
      <div style="font-size:12px;color:var(--muted-foreground)">$750 on 39 units, 4 returned</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:92px 14px minmax(0,1fr);align-items:start;gap:var(--gap-sm)">
    <div style="font-size:12px;color:var(--muted-foreground);text-align:right;padding-top:1px">Sep 14, 10pm</div>
    <div style="position:relative;height:100%">
      <span style="position:absolute;left:4px;top:5px;width:6px;height:6px;border-radius:50%;background:var(--warning)"></span>
    </div>
    <div>
      <div style="font-weight:500">Metadata sync stalled</div>
      <div style="font-size:12px;color:var(--muted-foreground)">Last successful pass 10:06pm; today's feed has not landed</div>
    </div>
  </div>
</div>
```

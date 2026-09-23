# Combo bar and line

Bars and a line on two axes, when the user asks for them on one plot — units
against dollars, sends against revenue — or when the two measures move together
and the reader wants them overlaid rather than stacked. Otherwise prefer
[paired-panels](paired-panels.md): two scales on one plot can invent a
correlation, so this form is the answer to a request, not a default.

Drawing it honestly: both axes start at zero and end on a nice maximum, so
neither series is stretched to flatter the other; the right axis ticks are the
same muted ink as the left, since they are context and not a second chart; and
the grid belongs to the left axis alone — the line never gets its own
horizontal rules. Bars go down first so the line reads as the overlay.

Scale derivation for this data: plot box x 40→684, y 24→212. The left pad
clears the 2-char units ticks, the right pad of 52 holds `$300` (4×6.3 + 8) at
plot right + 8, and the top pad holds the one direct label. Each axis takes its
own niceStep: units peak at 75, so step 20 and max 80, y(v) = 212 − v/80×188;
royalties peak at $282, so step 100 and max 300, y(v) = 212 − v/300×188. Seven
days share a 92px slot, and bar and point sit on the same centre, so the
series line up day by day.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Units and royalties climbed together through the week, from 47 units and $170 on Sep 15 to 75 units and $282 on Sep 21.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Units sold · left axis</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-2)"></span>Royalties · right axis</span>
</div>
<div style="position:relative">
  <svg viewBox="0 0 736 240" width="100%" role="img" aria-label="Units sold as bars on the left axis and royalties as a line on the right axis, both climbing from Sep 15 to Sep 21">
    <title>Units sold and royalties per day, Sep 15 to Sep 21</title>
    <!-- scale: plot box x 40→684, y 24→212; plotW 644, plotH 188
         n = 7, slot = 644/7 = 92, barW = min(24, slot*0.6 = 55.2) = 24, x_i = centre_i - barW/2 = 74, 166, …
         left axis, units: peak 75 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (15) = 20 → max = first multiple at or above the peak = 80 → step 20 · max 80, y(v) = 212 - v/80*188, ticks 0 / 20 / 40 / 60 / 80 at y 212 / 165 / 118 / 71 / 24
         right axis, royalties: peak $282 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (56.4) = 100 → max = first multiple at or above the peak = 300 → step 100 · max 300, y(v) = 212 - v/300*188, ticks $0 / $100 / $200 / $300 at y 212 / 149.3 / 86.7 / 24
         both axes start at zero and the gridlines are the left axis alone, drawn once; the right ticks label themselves at x = 684 + 8 -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="40" y1="212" x2="684" y2="212" stroke="var(--chart-grid)" stroke-width="1"/><text x="32" y="212" text-anchor="end" dominant-baseline="middle">0</text>
      <line x1="40" y1="165" x2="684" y2="165" stroke="var(--chart-grid)" stroke-width="1"/><text x="32" y="165" text-anchor="end" dominant-baseline="middle">20</text>
      <line x1="40" y1="118" x2="684" y2="118" stroke="var(--chart-grid)" stroke-width="1"/><text x="32" y="118" text-anchor="end" dominant-baseline="middle">40</text>
      <line x1="40" y1="71" x2="684" y2="71" stroke="var(--chart-grid)" stroke-width="1"/><text x="32" y="71" text-anchor="end" dominant-baseline="middle">60</text>
      <line x1="40" y1="24" x2="684" y2="24" stroke="var(--chart-grid)" stroke-width="1"/><text x="32" y="24" text-anchor="end" dominant-baseline="middle">80</text>
      <text x="692" y="212" text-anchor="start" dominant-baseline="middle">$0</text>
      <text x="692" y="149.3" text-anchor="start" dominant-baseline="middle">$100</text>
      <text x="692" y="86.7" text-anchor="start" dominant-baseline="middle">$200</text>
      <text x="692" y="24" text-anchor="start" dominant-baseline="middle">$300</text>
      <text x="86" y="230" text-anchor="middle">Sep 15</text>
      <text x="178" y="230" text-anchor="middle">Sep 16</text>
      <text x="270" y="230" text-anchor="middle">Sep 17</text>
      <text x="362" y="230" text-anchor="middle">Sep 18</text>
      <text x="454" y="230" text-anchor="middle">Sep 19</text>
      <text x="546" y="230" text-anchor="middle">Sep 20</text>
      <text x="638" y="230" text-anchor="middle">Sep 21</text>
      <g class="m"><path d="M 74,212 V 105.6 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><rect x="40" y="24" width="92" height="188" fill="transparent" data-label="Sep 15" data-value="47|$170" data-series="Units sold|Royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="86"/></g>
      <g class="m"><path d="M 166,212 V 93.8 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><rect x="132" y="24" width="92" height="188" fill="transparent" data-label="Sep 16" data-value="52|$186" data-series="Units sold|Royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="178"/></g>
      <g class="m"><path d="M 258,212 V 72.7 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><rect x="224" y="24" width="92" height="188" fill="transparent" data-label="Sep 17" data-value="61|$214" data-series="Units sold|Royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="270"/></g>
      <g class="m"><path d="M 350,212 V 79.7 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><rect x="316" y="24" width="92" height="188" fill="transparent" data-label="Sep 18" data-value="58|$203" data-series="Units sold|Royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="362"/></g>
      <g class="m"><path d="M 442,212 V 60.9 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><rect x="408" y="24" width="92" height="188" fill="transparent" data-label="Sep 19" data-value="66|$232" data-series="Units sold|Royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="454"/></g>
      <g class="m"><path d="M 534,212 V 49.2 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><rect x="500" y="24" width="92" height="188" fill="transparent" data-label="Sep 20" data-value="71|$255" data-series="Units sold|Royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="546"/></g>
      <g class="m"><path d="M 626,212 V 39.8 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><rect x="592" y="24" width="92" height="188" fill="transparent" data-label="Sep 21" data-value="75|$282" data-series="Units sold|Royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="638"/></g>
      <line class="crosshair" x1="86" y1="24" x2="86" y2="212" stroke="var(--border-strong)" stroke-width="1" visibility="hidden"/>
      <polyline points="86,105.5 178,95.4 270,77.9 362,84.8 454,66.6 546,52.2 638,35.3" fill="none" stroke="var(--chart-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="638" cy="35.3" r="4" fill="var(--chart-2)" stroke="var(--background)" stroke-width="2"/>
      <text x="638" y="12" text-anchor="middle" dominant-baseline="middle" fill="var(--foreground)" font-weight="500" style="font-variant-numeric: tabular-nums">$282</text>
    </g>
  </svg>
  <div class="tip" hidden style="position:absolute;left:0;top:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:6px 8px;font-size:12px;color:var(--foreground);pointer-events:none;white-space:nowrap"></div>
</div>
<script>
{ // The hover layer, identical in every chart fragment: the hit target under
  // (or nearest) the pointer fills one tip, the crosshair snaps to its x, and
  // the hovered mark lifts. Pipe-separated data-value/-series/-color list every
  // series at that x in one readout. The block keeps its names to itself, so
  // two charts can share one page.
  const wrap = document.currentScript.previousElementSibling;
  const tip = wrap.querySelector('.tip');
  const panels = [...wrap.querySelectorAll('svg')];
  const hits = panels.flatMap((panel) => [...panel.querySelectorAll('[data-value]')]);
  const el = (tag, css, text) => { const node = document.createElement(tag); node.style.cssText = css; node.textContent = text; return node; };
  let lifted = null;
  const move = (event) => {
    let near = event.target.closest('[data-value]');
    let best = Infinity;
    for (const hit of near ? [] : hits) {
      const box = hit.getBoundingClientRect();
      const away = Math.hypot(event.clientX - (box.left + box.right) / 2, event.clientY - (box.top + box.bottom) / 2);
      if (away < best) { best = away; near = hit; }
    }
    if (!near) { return; }
    const values = near.dataset.value.split('|');
    const names = (near.dataset.series ?? near.dataset.label).split('|');
    const colors = (near.dataset.color ?? '').split('|');
    tip.textContent = '';
    if (values.length > 1) { tip.append(el('div', 'color:var(--muted-foreground);margin-bottom:3px', near.dataset.label)); }
    values.forEach((value, index) => {
      const row = el('div', 'display:flex;align-items:center;gap:6px', '');
      if (colors[index]) { row.append(el('span', 'width:8px;height:8px;border-radius:2px;background:' + colors[index], '')); }
      row.append(el('b', 'font-weight:500;font-variant-numeric:tabular-nums', value), el('span', 'color:var(--muted-foreground)', names[index]));
      tip.append(row);
    });
    tip.hidden = false;
    const area = wrap.getBoundingClientRect();
    tip.style.left = Math.min(Math.max(event.clientX - area.left + 12, 0), area.width - tip.offsetWidth) + 'px';
    tip.style.top = Math.max(0, event.clientY - area.top - tip.offsetHeight - 10) + 'px';
    for (const cross of wrap.querySelectorAll('.crosshair')) { cross.setAttribute('x1', near.dataset.x); cross.setAttribute('x2', near.dataset.x); cross.style.visibility = 'visible'; }
    if (lifted !== near) { lifted?.closest('.m')?.style.removeProperty('opacity'); near.closest('.m')?.style.setProperty('opacity', '0.85'); lifted = near; }
  };
  const leave = () => { tip.hidden = true; lifted?.closest('.m')?.style.removeProperty('opacity'); lifted = null; for (const cross of wrap.querySelectorAll('.crosshair')) { cross.style.visibility = 'hidden'; } };
  for (const panel of panels) { panel.addEventListener('pointermove', move); panel.addEventListener('pointerleave', leave); }
}
</script>
```

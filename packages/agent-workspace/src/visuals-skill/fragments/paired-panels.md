# Paired panels

Two measures in different units over the same days — units and dollars, sends
and opens, sessions and spend. Unless the user asks for one plot, don't put them
on two y-axes; then use [combo-bar-line](combo-bar-line.md). The alignment of
two scales is arbitrary, so unasked it invents a correlation nobody measured.
Stack two panels instead, sharing one x band.

The panels share their left pad (48) and slot width (96.6), so the columns line
up, and only the lower panel carries x labels. Each panel takes its own
niceStep. Units peak at 75, so step 20 and max 80, y(v) = 138 − v/80×122.
Royalties peak at $282, so step 100 and max 300, y(v) = 90 − v/300×74. Each
day's hit target carries both values, so one tip answers the pair.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Units and royalties both climbed through the week, from 47 units and $170 on Sep 15 to 75 units and $282 on Sep 21.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Units sold</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-2)"></span>Royalties</span>
</div>
<div style="position:relative">
  <svg viewBox="0 0 736 150" width="100%" role="img" aria-label="Units sold per day, climbing from 47 on Sep 15 to 75 on Sep 21">
    <title>Units sold per day, 47 rising to 75</title>
    <!-- scale: units panel, plot box x 48→724, y 16→138; plotW 676, plotH 122
         n = 7, slot = 676/7 = 96.6, barW = min(24, slot*0.6 = 57.9) = 24, x_i = centre_i - barW/2 = 84.3, 180.9, …
         peak 75 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (15) = 20 → max = first multiple at or above the peak = 80 → step 20 · max 80, y(v) = 138 - v/80*122, ticks 0 / 20 / 40 / 60 / 80 at y 138 / 107.5 / 77 / 46.5 / 16
         this panel has no x labels: the lower one carries the shared band, and both use the same left pad so the plots line up -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="48" y1="138" x2="724" y2="138" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="138" text-anchor="end" dominant-baseline="middle">0</text>
      <line x1="48" y1="107.5" x2="724" y2="107.5" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="107.5" text-anchor="end" dominant-baseline="middle">20</text>
      <line x1="48" y1="77" x2="724" y2="77" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="77" text-anchor="end" dominant-baseline="middle">40</text>
      <line x1="48" y1="46.5" x2="724" y2="46.5" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="46.5" text-anchor="end" dominant-baseline="middle">60</text>
      <line x1="48" y1="16" x2="724" y2="16" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="16" text-anchor="end" dominant-baseline="middle">80</text>
      <g class="m"><path d="M 84.3,138 V 70.3 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 138 Z" fill="var(--chart-1)"/><rect x="48" y="16" width="96.6" height="122" fill="transparent" data-label="Sep 15" data-value="47|$170" data-series="units|royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="96.3"/></g>
      <g class="m"><path d="M 180.9,138 V 62.7 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 138 Z" fill="var(--chart-1)"/><rect x="144.6" y="16" width="96.6" height="122" fill="transparent" data-label="Sep 16" data-value="52|$186" data-series="units|royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="192.9"/></g>
      <g class="m"><path d="M 277.4,138 V 49 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 138 Z" fill="var(--chart-1)"/><rect x="241.1" y="16" width="96.6" height="122" fill="transparent" data-label="Sep 17" data-value="61|$214" data-series="units|royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="289.4"/></g>
      <g class="m"><path d="M 374,138 V 53.6 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 138 Z" fill="var(--chart-1)"/><rect x="337.7" y="16" width="96.6" height="122" fill="transparent" data-label="Sep 18" data-value="58|$203" data-series="units|royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="386"/></g>
      <g class="m"><path d="M 470.6,138 V 41.4 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 138 Z" fill="var(--chart-1)"/><rect x="434.3" y="16" width="96.6" height="122" fill="transparent" data-label="Sep 19" data-value="66|$232" data-series="units|royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="482.6"/></g>
      <g class="m"><path d="M 567.1,138 V 33.7 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 138 Z" fill="var(--chart-1)"/><rect x="530.9" y="16" width="96.6" height="122" fill="transparent" data-label="Sep 20" data-value="71|$255" data-series="units|royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="579.1"/></g>
      <g class="m"><path d="M 663.7,138 V 27.6 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 138 Z" fill="var(--chart-1)"/><rect x="627.4" y="16" width="96.6" height="122" fill="transparent" data-label="Sep 21" data-value="75|$282" data-series="units|royalties" data-color="var(--chart-1)|var(--chart-2)" data-x="675.7"/></g>
    </g>
  </svg>
  <svg viewBox="0 0 736 118" width="100%" role="img" aria-label="Royalties per day over the same week, $170 rising to $282">
    <title>Royalties per day, $170 rising to $282</title>
    <!-- scale: royalties panel, same x geometry (pad 48, slot 96.6, centre_i = 48 + 96.6*i + 48.3) so the two plots align
         plot box y 16→90 with the shared x band 90→118; plotH 74
         peak $282 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (56.4) = 100 → max = first multiple at or above the peak = 300 → step 100 · max 300, y(v) = 90 - v/300*74, ticks $0 / $100 / $200 / $300 at y 90 / 65.3 / 40.7 / 16
         two units, two panels, one x: a second y-axis only when it was asked for -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="48" y1="90" x2="724" y2="90" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="90" text-anchor="end" dominant-baseline="middle">$0</text>
      <line x1="48" y1="65.3" x2="724" y2="65.3" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="65.3" text-anchor="end" dominant-baseline="middle">$100</text>
      <line x1="48" y1="40.7" x2="724" y2="40.7" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="40.7" text-anchor="end" dominant-baseline="middle">$200</text>
      <line x1="48" y1="16" x2="724" y2="16" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="16" text-anchor="end" dominant-baseline="middle">$300</text>
      <text x="96.3" y="110" text-anchor="middle">Sep 15</text>
      <text x="192.9" y="110" text-anchor="middle">Sep 16</text>
      <text x="289.4" y="110" text-anchor="middle">Sep 17</text>
      <text x="386" y="110" text-anchor="middle">Sep 18</text>
      <text x="482.6" y="110" text-anchor="middle">Sep 19</text>
      <text x="579.1" y="110" text-anchor="middle">Sep 20</text>
      <text x="675.7" y="110" text-anchor="middle">Sep 21</text>
      <polyline points="96.3,48.1 192.9,44.1 289.4,37.2 386,39.9 482.6,32.8 579.1,27.1 675.7,20.4" fill="none" stroke="var(--chart-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line class="crosshair" x1="96.3" y1="16" x2="96.3" y2="90" stroke="var(--border-strong)" stroke-width="1" visibility="hidden"/>
      <circle cx="675.7" cy="20.4" r="4" fill="var(--chart-2)" stroke="var(--background)" stroke-width="2"/>
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

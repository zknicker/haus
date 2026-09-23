# Scatter and bubble

Two measures against each other, one bubble per item, sized by a third. Size
goes on the radius as √value so the reader compares areas, not radii — a linear
radius exaggerates the big ones fourfold. Still one y-axis: the second measure
is the x position, never a second scale. Points carry no names; label the two
that make the point and let the tip carry the rest.

Scale derivation for this data: plot box x 48→708, y 16→232. Spend peaks at
$780, so niceStep gives step 200 and max 800, x(s) = 48 + s/800×660, labels
every $200. ACOS is a measure against a measure, so its floor is the data's
rather than zero: the step is 10 and max 50 from the 41% peak, and the floor is
the step multiple at or under the 17% low, 10%. y(a) = 232 − (a − 10)/40×216,
gridlines at 10/20/30/40/50%. Radii are √units × 1.3, from 6.4 up to 12.7, and
each hit circle is r + 4 with a 12px floor so no bubble is a pinpoint.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Spend and ACOS barely track each other: the biggest spender is also the least efficient, at $780 and 41%.</h2>
<div style="position:relative">
  <svg viewBox="0 0 736 260" width="100%" role="img" aria-label="Campaign spend against ACOS, the largest spender at $780 also the least efficient at 41%">
    <title>Spend against ACOS by campaign, sized by units sold</title>
    <!-- scale: plot box x 48→708, y 16→232; plotW 660, plotH 216
         x, spend: peak $780 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (156) = 200 → max = first multiple at or above the peak = 800 → step 200 · max 800, x(s) = 48 + s/800*660; labels $0 / $200 / $400 / $600 / $800 under the plot
         y, ACOS: peak 41% → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (8.2) = 10 → max = first multiple at or above the peak = 50 → step 10 · max 50; a measure against a measure, so the floor is the data's: the step multiple at or under the 17% low, 10%
         y(a) = 232 - (a - 10)/40*216, ticks 10% / 20% / 30% / 40% / 50% at y 232 / 178 / 124 / 70 / 16
         area, not radius, carries the units: r = √units × 1.3 → 12.7, 12.2, 8.3, 11.2, 6.4, 8.9; the hit circle is r + 4, never under 12 -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="48" y1="232" x2="708" y2="232" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="232" text-anchor="end" dominant-baseline="middle">10%</text>
      <line x1="48" y1="178" x2="708" y2="178" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="178" text-anchor="end" dominant-baseline="middle">20%</text>
      <line x1="48" y1="124" x2="708" y2="124" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="124" text-anchor="end" dominant-baseline="middle">30%</text>
      <line x1="48" y1="70" x2="708" y2="70" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="70" text-anchor="end" dominant-baseline="middle">40%</text>
      <line x1="48" y1="16" x2="708" y2="16" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="16" text-anchor="end" dominant-baseline="middle">50%</text>
      <text x="48" y="252" text-anchor="middle">$0</text>
      <text x="213" y="252" text-anchor="middle">$200</text>
      <text x="378" y="252" text-anchor="middle">$400</text>
      <text x="543" y="252" text-anchor="middle">$600</text>
      <text x="708" y="252" text-anchor="middle">$800</text>
      <g class="m"><circle cx="386.2" cy="194.2" r="12.7" fill="color-mix(in srgb, var(--chart-1) 64%, transparent)" stroke="var(--background)" stroke-width="2"/><circle cx="386.2" cy="194.2" r="16.7" fill="transparent" data-label="Harvest tees" data-value="17%|$410|96" data-series="ACOS|spend|units"/></g>
      <g class="m"><circle cx="485.3" cy="156.4" r="12.2" fill="color-mix(in srgb, var(--chart-1) 64%, transparent)" stroke="var(--background)" stroke-width="2"/><circle cx="485.3" cy="156.4" r="16.2" fill="transparent" data-label="Bee family" data-value="24%|$530|88" data-series="ACOS|spend|units"/></g>
      <g class="m"><circle cx="287.3" cy="118.6" r="8.3" fill="color-mix(in srgb, var(--chart-1) 64%, transparent)" stroke="var(--background)" stroke-width="2"/><circle cx="287.3" cy="118.6" r="12.3" fill="transparent" data-label="Dog lovers" data-value="31%|$290|41" data-series="ACOS|spend|units"/></g>
      <g class="m"><circle cx="691.5" cy="64.6" r="11.2" fill="color-mix(in srgb, var(--chart-1) 64%, transparent)" stroke="var(--background)" stroke-width="2"/><circle cx="691.5" cy="64.6" r="15.2" fill="transparent" data-label="Holiday push" data-value="41%|$780|74" data-series="ACOS|spend|units"/></g>
      <g class="m"><circle cx="180" cy="134.8" r="6.4" fill="color-mix(in srgb, var(--chart-1) 64%, transparent)" stroke="var(--background)" stroke-width="2"/><circle cx="180" cy="134.8" r="12" fill="transparent" data-label="Cornhole" data-value="28%|$160|24" data-series="ACOS|spend|units"/></g>
      <g class="m"><circle cx="246" cy="167.2" r="8.9" fill="color-mix(in srgb, var(--chart-1) 64%, transparent)" stroke="var(--background)" stroke-width="2"/><circle cx="246" cy="167.2" r="12.9" fill="transparent" data-label="Mermaid" data-value="22%|$240|47" data-series="ACOS|spend|units"/></g>
      <text x="407" y="194.2" text-anchor="start" dominant-baseline="middle" fill="var(--foreground)">Harvest tees 17%</text>
      <text x="672.3" y="64.6" text-anchor="end" dominant-baseline="middle" fill="var(--foreground)">Holiday push 41%</text>
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

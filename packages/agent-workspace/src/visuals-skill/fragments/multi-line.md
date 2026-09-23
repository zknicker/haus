# Multi-line

Up to four independent series, in fixed slot order — `--chart-1`,
`--chart-2`, `--chart-3`, `--chart-4`. Colour follows the entity, so dropping a
series never re-deals the rest. Past four lines the hues stop separating: split
into small multiples instead. Each line is named at its end by a dot in the
series colour beside neutral text, because text never wears the data colour.

Scale derivation for this data: plot box x 48→628 (the 108px right pad holds
the end labels), y 16→212. Eight points make seven gaps, so gap = 580/7 = 82.9
and x_i = 48 + 82.9i. The high is 41%, so niceStep gives step 10 and max 50,
y(v) = 212 − v/50×196, gridlines every 10% up to 50%. Two lines finish 2 points
apart, under the ~14px two rows of 12px text need, so one label is nudged up
8px and keeps a leader line back to its own end.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Harvest tees hold the lowest ACOS at 17%, while the holiday push climbed to 41% over the last eight weeks.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Harvest tees</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-2)"></span>Bee family</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-3)"></span>Dog lovers</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-4)"></span>Holiday push</span>
</div>
<div style="position:relative">
  <svg viewBox="0 0 736 240" width="100%" role="img" aria-label="Weekly ACOS for four campaigns, harvest tees lowest at 17% and the holiday push highest at 41%">
    <title>Weekly ACOS by campaign, harvest tees lowest at 17%</title>
    <!-- scale: plot box x 48→628 (right pad 108 holds the end labels), y 16→212; plotW 580, plotH 196
         n = 8 points, gap = 580/(n-1) = 82.9, x_i = 48 + 82.9*i = 48, 130.9, … , 628
         peak 41% → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (8.2) = 10 → max = first multiple at or above the peak = 50 → step 10 · max 50, y(v) = 212 - v/50*196, ticks 0% / 10% / 20% / 30% / 40% / 50% at y 212 / 172.8 / 133.6 / 94.4 / 55.2 / 16
         end labels sit at y(last); dog lovers (26%) and bee family (24%) land 7.8px apart, under the ~14px two lines of
         12px text need, so that one is nudged 8px up and keeps a leader back to its line -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="48" y1="212" x2="628" y2="212" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="212" text-anchor="end" dominant-baseline="middle">0%</text>
      <line x1="48" y1="172.8" x2="628" y2="172.8" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="172.8" text-anchor="end" dominant-baseline="middle">10%</text>
      <line x1="48" y1="133.6" x2="628" y2="133.6" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="133.6" text-anchor="end" dominant-baseline="middle">20%</text>
      <line x1="48" y1="94.4" x2="628" y2="94.4" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="94.4" text-anchor="end" dominant-baseline="middle">30%</text>
      <line x1="48" y1="55.2" x2="628" y2="55.2" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="55.2" text-anchor="end" dominant-baseline="middle">40%</text>
      <line x1="48" y1="16" x2="628" y2="16" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="16" text-anchor="end" dominant-baseline="middle">50%</text>
      <text x="48" y="230" text-anchor="middle">Jul 21</text>
      <text x="213.7" y="230" text-anchor="middle">Aug 4</text>
      <text x="379.4" y="230" text-anchor="middle">Aug 18</text>
      <text x="545.1" y="230" text-anchor="middle">Sep 1</text>
      <line class="crosshair" x1="48" y1="16" x2="48" y2="212" stroke="var(--border-strong)" stroke-width="1" visibility="hidden"/>
      <polyline points="48,117.9 130.9,121.8 213.7,129.7 296.6,125.8 379.4,133.6 462.3,137.5 545.1,141.4 628,145.4" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="48,129.7 130.9,125.8 213.7,117.9 296.6,121.8 379.4,114 462.3,117.9 545.1,114 628,117.9" fill="none" stroke="var(--chart-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="48,98.3 130.9,102.2 213.7,94.4 296.6,98.3 379.4,102.2 462.3,106.2 545.1,106.2 628,110.1" fill="none" stroke="var(--chart-3)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="48,82.6 130.9,78.7 213.7,70.9 296.6,74.8 379.4,63 462.3,59.1 545.1,55.2 628,51.3" fill="none" stroke="var(--chart-4)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="638" cy="145.4" r="3" fill="var(--chart-1)"/><text x="646" y="145.4" dominant-baseline="middle" fill="var(--muted-foreground)">Harvest tees</text>
      <circle cx="638" cy="117.9" r="3" fill="var(--chart-2)"/><text x="646" y="117.9" dominant-baseline="middle" fill="var(--muted-foreground)">Bee family</text>
      <path d="M 628,110.1 L 634,102.1" fill="none" stroke="var(--chart-grid)" stroke-width="1"/>
      <circle cx="638" cy="102.1" r="3" fill="var(--chart-3)"/><text x="646" y="102.1" dominant-baseline="middle" fill="var(--muted-foreground)">Dog lovers</text>
      <circle cx="638" cy="51.3" r="3" fill="var(--chart-4)"/><text x="646" y="51.3" dominant-baseline="middle" fill="var(--muted-foreground)">Holiday push</text>
      <rect x="6.6" y="16" width="82.9" height="196" fill="transparent" data-label="Jul 21" data-value="24%|21%|29%|33%" data-series="Harvest tees|Bee family|Dog lovers|Holiday push" data-color="var(--chart-1)|var(--chart-2)|var(--chart-3)|var(--chart-4)" data-x="48"/>
      <rect x="89.4" y="16" width="82.9" height="196" fill="transparent" data-label="Jul 28" data-value="23%|22%|28%|34%" data-series="Harvest tees|Bee family|Dog lovers|Holiday push" data-color="var(--chart-1)|var(--chart-2)|var(--chart-3)|var(--chart-4)" data-x="130.9"/>
      <rect x="172.3" y="16" width="82.9" height="196" fill="transparent" data-label="Aug 4" data-value="21%|24%|30%|36%" data-series="Harvest tees|Bee family|Dog lovers|Holiday push" data-color="var(--chart-1)|var(--chart-2)|var(--chart-3)|var(--chart-4)" data-x="213.7"/>
      <rect x="255.1" y="16" width="82.9" height="196" fill="transparent" data-label="Aug 11" data-value="22%|23%|29%|35%" data-series="Harvest tees|Bee family|Dog lovers|Holiday push" data-color="var(--chart-1)|var(--chart-2)|var(--chart-3)|var(--chart-4)" data-x="296.6"/>
      <rect x="338" y="16" width="82.9" height="196" fill="transparent" data-label="Aug 18" data-value="20%|25%|28%|38%" data-series="Harvest tees|Bee family|Dog lovers|Holiday push" data-color="var(--chart-1)|var(--chart-2)|var(--chart-3)|var(--chart-4)" data-x="379.4"/>
      <rect x="420.9" y="16" width="82.9" height="196" fill="transparent" data-label="Aug 25" data-value="19%|24%|27%|39%" data-series="Harvest tees|Bee family|Dog lovers|Holiday push" data-color="var(--chart-1)|var(--chart-2)|var(--chart-3)|var(--chart-4)" data-x="462.3"/>
      <rect x="503.7" y="16" width="82.9" height="196" fill="transparent" data-label="Sep 1" data-value="18%|25%|27%|40%" data-series="Harvest tees|Bee family|Dog lovers|Holiday push" data-color="var(--chart-1)|var(--chart-2)|var(--chart-3)|var(--chart-4)" data-x="545.1"/>
      <rect x="586.6" y="16" width="82.9" height="196" fill="transparent" data-label="Sep 8" data-value="17%|24%|26%|41%" data-series="Harvest tees|Bee family|Dog lovers|Holiday push" data-color="var(--chart-1)|var(--chart-2)|var(--chart-3)|var(--chart-4)" data-x="628"/>
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

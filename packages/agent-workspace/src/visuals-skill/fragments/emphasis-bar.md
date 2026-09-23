# Emphasis bar

One series, one question: the period the question is about in `--chart-1`, its
history in `--chart-5`, and a single label on the mark that answers it. Reach
for this whenever the ask is "how is X doing" — a row of equal bars makes the
reader hunt for the point.

Scale derivation for this data: the plot box runs x 48→724 (left pad 48 carries
the `$` ticks) and y 28→212, so eight weeks share 676px, a 84.5px slot each,
of which the bar takes 24 and the rest stays air. The top week is $8,100, so
niceStep gives step 2000 and the axis runs to the first multiple at or above
the peak, max 10000: y(v) = 212 − v/10000×184, gridlines at
$0 / $2K / $4K / $6K / $8K / $10K, compact because the top tick reaches 10,000.
Change the data and recompute step and max; every coordinate below comes from
them.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Last week brought in $8,100, the shop's best week since July.</h2>
<div style="position:relative">
  <svg viewBox="0 0 736 240" width="100%" role="img" aria-label="Weekly revenue across eight weeks, last week the highest at $8,100">
    <title>Weekly revenue, last week the highest at $8,100</title>
    <!-- scale: plot box x 48→724 (left pad 48 for the $ ticks, right pad 12), y 28→212; plotW 676, plotH 184
         n = 8, slot = 676/8 = 84.5, barW = min(24, slot*0.6 = 50.7) = 24
         x_i = 48 + 84.5*i + (84.5 - 24)/2 = 78.3, 162.8, … , 669.8
         peak $8,100 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (1,620) = 2,000 → max = first multiple at or above the peak = 10,000 → step 2000 · max 10000, y(v) = 212 - v/10000*184
         ticks $0 / $2K / $4K / $6K / $8K / $10K at y 212 / 175.2 / 138.4 / 101.6 / 64.8 / 28; the top tick reaches 10,000, so the whole axis is compact -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="48" y1="212" x2="724" y2="212" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="212" text-anchor="end" dominant-baseline="middle">$0</text>
      <line x1="48" y1="175.2" x2="724" y2="175.2" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="175.2" text-anchor="end" dominant-baseline="middle">$2K</text>
      <line x1="48" y1="138.4" x2="724" y2="138.4" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="138.4" text-anchor="end" dominant-baseline="middle">$4K</text>
      <line x1="48" y1="101.6" x2="724" y2="101.6" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="101.6" text-anchor="end" dominant-baseline="middle">$6K</text>
      <line x1="48" y1="64.8" x2="724" y2="64.8" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="64.8" text-anchor="end" dominant-baseline="middle">$8K</text>
      <line x1="48" y1="28" x2="724" y2="28" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="28" text-anchor="end" dominant-baseline="middle">$10K</text>
      <text x="90.3" y="230" text-anchor="middle">Jul 21</text>
      <text x="174.8" y="230" text-anchor="middle">Jul 28</text>
      <text x="259.3" y="230" text-anchor="middle">Aug 4</text>
      <text x="343.8" y="230" text-anchor="middle">Aug 11</text>
      <text x="428.3" y="230" text-anchor="middle">Aug 18</text>
      <text x="512.8" y="230" text-anchor="middle">Aug 25</text>
      <text x="597.3" y="230" text-anchor="middle">Sep 1</text>
      <text x="681.8" y="230" text-anchor="middle">Sep 8</text>
      <g class="m"><path d="M 78.3,212 V 102.3 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="48" y="28" width="84.5" height="184" fill="transparent" data-label="Jul 21" data-value="$6,180"/></g>
      <g class="m"><path d="M 162.8,212 V 106.7 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="132.5" y="28" width="84.5" height="184" fill="transparent" data-label="Jul 28" data-value="$5,940"/></g>
      <g class="m"><path d="M 247.3,212 V 92.4 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="217" y="28" width="84.5" height="184" fill="transparent" data-label="Aug 4" data-value="$6,720"/></g>
      <g class="m"><path d="M 331.8,212 V 98.1 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="301.5" y="28" width="84.5" height="184" fill="transparent" data-label="Aug 11" data-value="$6,410"/></g>
      <g class="m"><path d="M 416.3,212 V 86.3 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="386" y="28" width="84.5" height="184" fill="transparent" data-label="Aug 18" data-value="$7,050"/></g>
      <g class="m"><path d="M 500.8,212 V 89.4 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="470.5" y="28" width="84.5" height="184" fill="transparent" data-label="Aug 25" data-value="$6,880"/></g>
      <g class="m"><path d="M 585.3,212 V 81.3 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="555" y="28" width="84.5" height="184" fill="transparent" data-label="Sep 1" data-value="$7,320"/></g>
      <g class="m"><path d="M 669.8,212 V 67 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><rect x="639.5" y="28" width="84.5" height="184" fill="transparent" data-label="Sep 8" data-value="$8,100"/></g>
      <text x="681.8" y="55" text-anchor="middle" fill="var(--foreground)" font-weight="500" style="font-variant-numeric: tabular-nums">$8,100</text>
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

# Grouped bar

This period against the prior one. Two series, so a legend — and the pair is
blue against gray, never two hues: the prior period is context, not a rival
identity. Three series is the ceiling; past that the groups turn into a picket
fence and a multi-line or small multiples reads better.

Scale derivation for this data: the left pad is 56 because the widest tick,
`$1,500`, needs 6 × 7.6 + 8 = 53.6 (rounded up to a multiple of 4), with the
ticks right-aligned at 48. The plot box runs x 56→724, y 20→212, so seven days
take a 95.4px slot. Two bars and their 2px gap share 60% of the slot, which
gives (95.4×0.6 − 2)/2 = 27.6 per bar, the pair 57.3 with the gap. The top value is $1,162, so niceStep gives
step 500 and max 1500, y(v) = 212 − v/1500×192, and the gridlines land on
$0 / $500 / $1,000 / $1,500.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Last week's revenue beat the prior week every day but Tuesday.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Last week $6,940</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-5)"></span>Prior week $6,545</span>
</div>
<div style="position:relative">
  <svg viewBox="0 0 736 240" width="100%" role="img" aria-label="Daily revenue, last week ahead of the prior week every day but Tuesday">
    <title>Daily revenue, last week against the prior week</title>
    <!-- scale: padL 56 = widest tick "$1,500" 6 × 7.6 + 8, rounded up to 4; ticks right-aligned at 48
         plot box x 56→724, y 20→212; plotW 668, plotH 192
         n = 7, slot = 668/7 = 95.4; two bars + a 2px gap share slot*0.6 = 57.3,
         so barW = (slot*0.6 - 2)/2 = 27.6 and group_i = 56 + 95.4*i + (slot - (2*barW + 2))/2
         = 75.1, 170.5, … ; the prior-week bar sits at group_i + barW + 2
         peak $1,162 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (232.4) = 500 → max = first multiple at or above the peak = 1,500 → step 500 · max 1500, y(v) = 212 - v/1500*192
         ticks $0 / $500 / $1,000 / $1,500 at y 212 / 148 / 84 / 20 -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="56" y1="212" x2="724" y2="212" stroke="var(--chart-grid)" stroke-width="1"/><text x="48" y="212" text-anchor="end" dominant-baseline="middle">$0</text>
      <line x1="56" y1="148" x2="724" y2="148" stroke="var(--chart-grid)" stroke-width="1"/><text x="48" y="148" text-anchor="end" dominant-baseline="middle">$500</text>
      <line x1="56" y1="84" x2="724" y2="84" stroke="var(--chart-grid)" stroke-width="1"/><text x="48" y="84" text-anchor="end" dominant-baseline="middle">$1,000</text>
      <line x1="56" y1="20" x2="724" y2="20" stroke="var(--chart-grid)" stroke-width="1"/><text x="48" y="20" text-anchor="end" dominant-baseline="middle">$1,500</text>
      <text x="103.7" y="230" text-anchor="middle">Mon</text>
      <text x="199.2" y="230" text-anchor="middle">Tue</text>
      <text x="294.5" y="230" text-anchor="middle">Wed</text>
      <text x="390" y="230" text-anchor="middle">Thu</text>
      <text x="485.5" y="230" text-anchor="middle">Fri</text>
      <text x="580.8" y="230" text-anchor="middle">Sat</text>
      <text x="676.3" y="230" text-anchor="middle">Sun</text>
      <g class="m"><path d="M 75.1,212 V 80.2 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><path d="M 104.7,212 V 96.7 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="56" y="20" width="95.5" height="192" fill="transparent" data-label="Mon" data-value="$1,061|$932" data-series="Last week|Prior week" data-color="var(--chart-1)|var(--chart-5)"/></g>
      <g class="m"><path d="M 170.5,212 V 86.2 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><path d="M 200.2,212 V 67.3 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="151.5" y="20" width="95.5" height="192" fill="transparent" data-label="Tue" data-value="$1,014|$1,162" data-series="Last week|Prior week" data-color="var(--chart-1)|var(--chart-5)"/></g>
      <g class="m"><path d="M 265.9,212 V 102.8 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><path d="M 295.5,212 V 106.2 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="246.8" y="20" width="95.5" height="192" fill="transparent" data-label="Wed" data-value="$884|$858" data-series="Last week|Prior week" data-color="var(--chart-1)|var(--chart-5)"/></g>
      <g class="m"><path d="M 361.3,212 V 86.1 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><path d="M 391,212 V 90.2 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="342.3" y="20" width="95.5" height="192" fill="transparent" data-label="Thu" data-value="$1,015|$983" data-series="Last week|Prior week" data-color="var(--chart-1)|var(--chart-5)"/></g>
      <g class="m"><path d="M 456.8,212 V 105.2 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><path d="M 486.4,212 V 121.2 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="437.7" y="20" width="95.5" height="192" fill="transparent" data-label="Fri" data-value="$866|$741" data-series="Last week|Prior week" data-color="var(--chart-1)|var(--chart-5)"/></g>
      <g class="m"><path d="M 552.2,212 V 95.9 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><path d="M 581.8,212 V 122.3 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="533.2" y="20" width="95.5" height="192" fill="transparent" data-label="Sat" data-value="$938|$732" data-series="Last week|Prior week" data-color="var(--chart-1)|var(--chart-5)"/></g>
      <g class="m"><path d="M 647.6,212 V 67.3 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-1)"/><path d="M 677.3,212 V 70.5 a4 4 0 0 1 4,-4 h 19.7 a4 4 0 0 1 4,4 V 212 Z" fill="var(--chart-5)"/><rect x="628.5" y="20" width="95.5" height="192" fill="transparent" data-label="Sun" data-value="$1,162|$1,137" data-series="Last week|Prior week" data-color="var(--chart-1)|var(--chart-5)"/></g>
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

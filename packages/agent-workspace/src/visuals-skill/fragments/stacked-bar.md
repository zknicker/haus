# Stacked bar

How the mix shifts. A stack is one measure cut up, not several independent
things, so it takes one hue in sequential steps — 100%, 60%, 35% — and never
the categorical hues. The legend reads in stack order, top segment first, so
the reader never has to invert it. No segment carries a number: interior
labels have no free end to sit against, so the legend and the tip carry them.

Scale derivation for this data: plot box x 48→724, y 20→212; six months share
676px, a 112.7px slot, of which the bar takes the 24px cap. The tallest column
is $6,640 (US + GB + DE in September), so niceStep gives step 2000 and max 8000,
y(v) = 212 − v/8000×192, and the gridlines land on $0 / $2,000 / $4,000 / $6,000 / $8,000.
Each segment spans y(total below + value) → y(total below) and gives up 2px at
its foot for the gap.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The US carries about 78% of revenue every month, and all three marketplaces grew into September.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 35%, transparent)"></span>DE $3.6K</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 60%, transparent)"></span>GB $4.3K</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>US $27.5K</span>
</div>
<div style="position:relative">
  <svg viewBox="0 0 736 240" width="100%" role="img" aria-label="Monthly revenue split by marketplace, the US holding about 78% of the total every month">
    <title>Monthly revenue by marketplace, US about 78% throughout</title>
    <!-- scale: plot box x 48→724, y 20→212; plotW 676, plotH 192
         n = 6, slot = 676/6 = 112.7, barW = min(24, slot*0.6 = 67.6) = 24, x_i = 48 + 112.7*i + (slot - barW)/2
         peak (the tallest column) $6,640 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (1,328) = 2,000 → max = first multiple at or above the peak = 8,000 → step 2000 · max 8000, y(v) = 212 - v/8000*192
         ticks $0 / $2,000 / $4,000 / $6,000 / $8,000 at y 212 / 164 / 116 / 68 / 20
         each segment runs y(sum below + value) → y(sum below), minus 2px at the foot so the backdrop separates it -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="48" y1="212" x2="724" y2="212" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="212" text-anchor="end" dominant-baseline="middle">$0</text>
      <line x1="48" y1="164" x2="724" y2="164" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="164" text-anchor="end" dominant-baseline="middle">$2,000</text>
      <line x1="48" y1="116" x2="724" y2="116" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="116" text-anchor="end" dominant-baseline="middle">$4,000</text>
      <line x1="48" y1="68" x2="724" y2="68" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="68" text-anchor="end" dominant-baseline="middle">$6,000</text>
      <line x1="48" y1="20" x2="724" y2="20" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="20" text-anchor="end" dominant-baseline="middle">$8,000</text>
      <text x="104.3" y="230" text-anchor="middle">Apr</text>
      <text x="217" y="230" text-anchor="middle">May</text>
      <text x="329.7" y="230" text-anchor="middle">Jun</text>
      <text x="442.3" y="230" text-anchor="middle">Jul</text>
      <text x="555" y="230" text-anchor="middle">Aug</text>
      <text x="667.7" y="230" text-anchor="middle">Sep</text>
      <g class="m"><rect x="92.3" y="113.1" width="24" height="98.9" fill="var(--chart-1)"/><rect x="92.3" y="97.8" width="24" height="13.4" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><path d="M 92.3,95.8 V 89.3 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 95.8 Z" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/><rect x="48" y="20" width="112.7" height="192" fill="transparent" data-label="Apr" data-value="$520|$640|$4,120" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
      <g class="m"><rect x="205" y="106.9" width="24" height="105.1" fill="var(--chart-1)"/><rect x="205" y="89.8" width="24" height="15" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><path d="M 205,87.8 V 80.4 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 87.8 Z" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/><rect x="160.7" y="20" width="112.7" height="192" fill="transparent" data-label="May" data-value="$560|$710|$4,380" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
      <g class="m"><rect x="317.7" y="100.4" width="24" height="111.6" fill="var(--chart-1)"/><rect x="317.7" y="84.1" width="24" height="14.3" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><path d="M 317.7,82.1 V 73.4 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 82.1 Z" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/><rect x="273.3" y="20" width="112.7" height="192" fill="transparent" data-label="Jun" data-value="$610|$680|$4,650" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
      <g class="m"><rect x="430.3" y="106.2" width="24" height="105.8" fill="var(--chart-1)"/><rect x="430.3" y="88.9" width="24" height="15.3" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><path d="M 430.3,86.9 V 78.7 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 86.9 Z" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/><rect x="386" y="20" width="112.7" height="192" fill="transparent" data-label="Jul" data-value="$590|$720|$4,410" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
      <g class="m"><rect x="543" y="96.3" width="24" height="115.7" fill="var(--chart-1)"/><rect x="543" y="78.1" width="24" height="16.2" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><path d="M 543,76.1 V 66.7 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 76.1 Z" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/><rect x="498.7" y="20" width="112.7" height="192" fill="transparent" data-label="Aug" data-value="$640|$760|$4,820" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
      <g class="m"><rect x="655.7" y="88.9" width="24" height="123.1" fill="var(--chart-1)"/><rect x="655.7" y="69.4" width="24" height="17.4" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><path d="M 655.7,67.4 V 56.6 a4 4 0 0 1 4,-4 h 16 a4 4 0 0 1 4,4 V 67.4 Z" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/><rect x="611.3" y="20" width="112.7" height="192" fill="transparent" data-label="Sep" data-value="$700|$810|$5,130" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
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

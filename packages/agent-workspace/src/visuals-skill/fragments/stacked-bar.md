# Stacked bar

How the mix shifts. A stack is one measure cut up, not several independent
things, so it takes one hue in sequential steps — 100%, 60%, 35% — and never
the categorical hues. The legend reads in stack order, top segment first, so
the reader never has to invert it. No segment carries a number: interior
labels have no free end to sit against, so the legend and the tip carry them.

The one exception to the single hue: when the stacked categories are
themselves states, ordered bad → good (serious / minor / none, failed / flaky /
passed), the segments take `--error`, `--warning`, `--success` in that order,
and the legend names each state in words. The total above the one or two peak
columns may carry a direct label; the rest stay bare.

Scale derivation for this data — a fluid plot, laid out like
[emphasis-bar](emphasis-bar.md): the gutter is 56px because `$8,000` needs it
(6 chars × 7.6 + 8, rounded up to a multiple of 4); six months share the plot at a
16.7% slot, the bar takes min(60/n, 10)% = 10%. The tallest column is $6,640 (US +
GB + DE in September), so niceStep gives step 2000 and max 8000,
y(v) = 212 − v/8000×192. Each segment spans y(total below + value) → y(total
below) and gives up 2px at its foot for the gap; only the top segment takes the
rounded end.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The US carries about 78% of revenue every month, and all three marketplaces grew into September.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:10px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 35%, transparent)"></span>DE $3.6K</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 60%, transparent)"></span>GB $4.3K</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>US $27.5K</span>
</div>
<div style="position:relative">
  <div style="display:flex">
    <svg width="56" height="240" aria-hidden="true" style="flex:none;font-family:var(--font-sans)">
      <g font-size="12" fill="var(--chart-label)" style="font-variant-numeric: tabular-nums">
        <text x="48" y="212" text-anchor="end" dominant-baseline="middle">$0</text>
        <text x="48" y="164" text-anchor="end" dominant-baseline="middle">$2,000</text>
        <text x="48" y="116" text-anchor="end" dominant-baseline="middle">$4,000</text>
        <text x="48" y="68" text-anchor="end" dominant-baseline="middle">$6,000</text>
        <text x="48" y="20" text-anchor="end" dominant-baseline="middle">$8,000</text>
      </g>
    </svg>
    <svg width="100%" height="240" role="img" aria-label="Monthly revenue split by marketplace, the US holding about 78% of the total every month" style="flex:1 1 0;min-width:0;font-family:var(--font-sans)">
      <title>Monthly revenue by marketplace, US about 78% throughout</title>
      <!-- scale: fluid plot — height 240px fixed, x in % of the plot, y in px; gutter 56px = widest tick "$8,000" (6 chars × 7.6 + 8, up to a multiple of 4), ticks right-aligned at 48
         n = 6, slot = 100/6 = 16.7%, bar = min(60/n, 10) = 10% of the plot, x_i = 16.7·i + 3.3%
         peak (the tallest column) $6,640 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (1,328) = 2,000 → max = first multiple at or above the peak = 8,000 → step 2000 · max 8000, y(v) = 212 - v/8000*192
         each segment runs y(sum below + value) → y(sum below), minus 2px at its foot for the gap; the top segment is the nested-viewport bar with the rounded end -->
      <g font-size="12" fill="var(--chart-label)">
        <line x1="0" y1="212" x2="100%" y2="212" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="164" x2="100%" y2="164" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="116" x2="100%" y2="116" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="68" x2="100%" y2="68" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="20" x2="100%" y2="20" stroke="var(--chart-grid)" stroke-width="1"/>
        <text x="8.3%" y="230" text-anchor="middle">Apr</text>
        <text x="25%" y="230" text-anchor="middle">May</text>
        <text x="41.7%" y="230" text-anchor="middle">Jun</text>
        <text x="58.3%" y="230" text-anchor="middle">Jul</text>
        <text x="75%" y="230" text-anchor="middle">Aug</text>
        <text x="91.7%" y="230" text-anchor="middle">Sep</text>
        <g class="m"><rect x="3.3%" width="10%" y="113.1" height="98.9" fill="var(--chart-1)"/><rect x="3.3%" width="10%" y="97.8" height="13.4" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><svg x="3.3%" y="85.3" width="10%" height="10.5"><rect width="100%" height="14.5" rx="4" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/></svg><rect x="0%" y="20" width="16.7%" height="192" fill="transparent" data-label="Apr" data-value="$520|$640|$4,120" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
        <g class="m"><rect x="20%" width="10%" y="106.9" height="105.1" fill="var(--chart-1)"/><rect x="20%" width="10%" y="89.8" height="15" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><svg x="20%" y="76.4" width="10%" height="11.4"><rect width="100%" height="15.4" rx="4" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/></svg><rect x="16.7%" y="20" width="16.7%" height="192" fill="transparent" data-label="May" data-value="$560|$710|$4,380" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
        <g class="m"><rect x="36.7%" width="10%" y="100.4" height="111.6" fill="var(--chart-1)"/><rect x="36.7%" width="10%" y="84.1" height="14.3" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><svg x="36.7%" y="69.4" width="10%" height="12.6"><rect width="100%" height="16.6" rx="4" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/></svg><rect x="33.3%" y="20" width="16.7%" height="192" fill="transparent" data-label="Jun" data-value="$610|$680|$4,650" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
        <g class="m"><rect x="53.3%" width="10%" y="106.2" height="105.8" fill="var(--chart-1)"/><rect x="53.3%" width="10%" y="88.9" height="15.3" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><svg x="53.3%" y="74.7" width="10%" height="12.2"><rect width="100%" height="16.2" rx="4" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/></svg><rect x="50%" y="20" width="16.7%" height="192" fill="transparent" data-label="Jul" data-value="$590|$720|$4,410" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
        <g class="m"><rect x="70%" width="10%" y="96.3" height="115.7" fill="var(--chart-1)"/><rect x="70%" width="10%" y="78.1" height="16.2" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><svg x="70%" y="62.7" width="10%" height="13.4"><rect width="100%" height="17.4" rx="4" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/></svg><rect x="66.7%" y="20" width="16.7%" height="192" fill="transparent" data-label="Aug" data-value="$640|$760|$4,820" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
        <g class="m"><rect x="86.7%" width="10%" y="88.9" height="123.1" fill="var(--chart-1)"/><rect x="86.7%" width="10%" y="69.4" height="17.4" fill="color-mix(in srgb, var(--chart-1) 60%, transparent)"/><svg x="86.7%" y="52.6" width="10%" height="14.8"><rect width="100%" height="18.8" rx="4" fill="color-mix(in srgb, var(--chart-1) 35%, transparent)"/></svg><rect x="83.3%" y="20" width="16.7%" height="192" fill="transparent" data-label="Sep" data-value="$700|$810|$5,130" data-series="DE|GB|US" data-color="color-mix(in srgb, var(--chart-1) 35%, transparent)|color-mix(in srgb, var(--chart-1) 60%, transparent)|var(--chart-1)"/></g>
        <text x="96.7%" y="44.6" text-anchor="end" fill="var(--foreground)" font-weight="500" style="font-variant-numeric: tabular-nums">$6,640</text>
      </g>
    </svg>
  </div>
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

# Emphasis bar

One series, one question: the period the question is about in `--chart-1`, its
history in `--chart-5`, and a direct label on the mark that answers it (plus the peak, when that is a different mark). Reach
for this whenever the ask is "how is X doing" — a row of equal bars makes the
reader hunt for the point.

Scale derivation for this data — a **fluid plot**, so the chart keeps its 240px
height and real 12px text at any width, phone included: a gutter `<svg>` carries
the ticks, right-aligned 8px inside its edge, and is as wide as the widest tick
needs (`$10K`, 4 chars × 7.6 + 8, rounded up to 40); the plot `<svg>` fills the
rest, x in percent of its width, y in pixels. Eight weeks get a 12.5% slot each,
and the bar takes min(60/n, 10)% = 7.5%. The top week is $8,100, so niceStep
gives step 2000 and max 10000: y(v) = 212 − v/10000×184, gridlines at
$0 / $2K / $4K / $6K / $8K / $10K, compact because the top tick reaches 10,000.
Below 560px every other week label hides (`.alt`). Change the data and
recompute step and max; every coordinate below comes from them.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Last week brought in $8,100, the shop's best week since July.</h2>
<style>@media (max-width: 560px) { .alt { display: none; } }</style>
<div style="position:relative">
  <div style="display:flex">
    <svg width="40" height="240" aria-hidden="true" style="flex:none;font-family:var(--font-sans)">
      <g font-size="12" fill="var(--chart-label)" style="font-variant-numeric: tabular-nums">
        <text x="32" y="212" text-anchor="end" dominant-baseline="middle">$0</text>
        <text x="32" y="175.2" text-anchor="end" dominant-baseline="middle">$2K</text>
        <text x="32" y="138.4" text-anchor="end" dominant-baseline="middle">$4K</text>
        <text x="32" y="101.6" text-anchor="end" dominant-baseline="middle">$6K</text>
        <text x="32" y="64.8" text-anchor="end" dominant-baseline="middle">$8K</text>
        <text x="32" y="28" text-anchor="end" dominant-baseline="middle">$10K</text>
      </g>
    </svg>
    <svg width="100%" height="240" role="img" aria-label="Weekly revenue across eight weeks, last week the highest at $8,100" style="flex:1 1 0;min-width:0;font-family:var(--font-sans)">
      <title>Weekly revenue, last week the highest at $8,100</title>
      <!-- scale: fluid plot — height 240px fixed, x in % of the plot, y in px; gutter 40px = widest tick "$10K" (4 chars × 7.6 + 8, up to a multiple of 4), ticks right-aligned at 32
         n = 8, slot = 100/8 = 12.5%, bar = min(60/n, 10) = 7.5% of the plot, x_i = 12.5·i + 2.5%, centre_i = 12.5·i + 6.3%
         peak $8,100 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (1,620) = 2,000 → max = first multiple at or above the peak = 10,000 → step 2000 · max 10000, y(v) = 212 - v/10000*184
         each bar is a nested svg viewport at the bar's box holding one rx 4 rect 4px taller, so the viewport clips the bottom corners square; under 560px the .alt week labels hide -->
      <g font-size="12" fill="var(--chart-label)">
        <line x1="0" y1="212" x2="100%" y2="212" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="175.2" x2="100%" y2="175.2" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="138.4" x2="100%" y2="138.4" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="101.6" x2="100%" y2="101.6" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="64.8" x2="100%" y2="64.8" stroke="var(--chart-grid)" stroke-width="1"/>
        <line x1="0" y1="28" x2="100%" y2="28" stroke="var(--chart-grid)" stroke-width="1"/>
        <text class="alt" x="6.3%" y="230" text-anchor="middle">Jul 21</text>
        <text x="18.8%" y="230" text-anchor="middle">Jul 28</text>
        <text class="alt" x="31.3%" y="230" text-anchor="middle">Aug 4</text>
        <text x="43.8%" y="230" text-anchor="middle">Aug 11</text>
        <text class="alt" x="56.3%" y="230" text-anchor="middle">Aug 18</text>
        <text x="68.8%" y="230" text-anchor="middle">Aug 25</text>
        <text class="alt" x="81.3%" y="230" text-anchor="middle">Sep 1</text>
        <text x="93.8%" y="230" text-anchor="middle">Sep 8</text>
        <g class="m"><svg x="2.5%" y="98.3" width="7.5%" height="113.7"><rect width="100%" height="117.7" rx="4" fill="var(--chart-5)"/></svg><rect x="0%" y="28" width="12.5%" height="184" fill="transparent" data-label="Jul 21" data-value="$6,180"/></g>
        <g class="m"><svg x="15%" y="102.7" width="7.5%" height="109.3"><rect width="100%" height="113.3" rx="4" fill="var(--chart-5)"/></svg><rect x="12.5%" y="28" width="12.5%" height="184" fill="transparent" data-label="Jul 28" data-value="$5,940"/></g>
        <g class="m"><svg x="27.5%" y="88.4" width="7.5%" height="123.6"><rect width="100%" height="127.6" rx="4" fill="var(--chart-5)"/></svg><rect x="25%" y="28" width="12.5%" height="184" fill="transparent" data-label="Aug 4" data-value="$6,720"/></g>
        <g class="m"><svg x="40%" y="94.1" width="7.5%" height="117.9"><rect width="100%" height="121.9" rx="4" fill="var(--chart-5)"/></svg><rect x="37.5%" y="28" width="12.5%" height="184" fill="transparent" data-label="Aug 11" data-value="$6,410"/></g>
        <g class="m"><svg x="52.5%" y="82.3" width="7.5%" height="129.7"><rect width="100%" height="133.7" rx="4" fill="var(--chart-5)"/></svg><rect x="50%" y="28" width="12.5%" height="184" fill="transparent" data-label="Aug 18" data-value="$7,050"/></g>
        <g class="m"><svg x="65%" y="85.4" width="7.5%" height="126.6"><rect width="100%" height="130.6" rx="4" fill="var(--chart-5)"/></svg><rect x="62.5%" y="28" width="12.5%" height="184" fill="transparent" data-label="Aug 25" data-value="$6,880"/></g>
        <g class="m"><svg x="77.5%" y="77.3" width="7.5%" height="134.7"><rect width="100%" height="138.7" rx="4" fill="var(--chart-5)"/></svg><rect x="75%" y="28" width="12.5%" height="184" fill="transparent" data-label="Sep 1" data-value="$7,320"/></g>
        <g class="m"><svg x="90%" y="63" width="7.5%" height="149"><rect width="100%" height="153" rx="4" fill="var(--chart-1)"/></svg><rect x="87.5%" y="28" width="12.5%" height="184" fill="transparent" data-label="Sep 8" data-value="$8,100"/></g>
        <text x="97.5%" y="55" text-anchor="end" fill="var(--foreground)" font-weight="500" style="font-variant-numeric: tabular-nums">$8,100</text>
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

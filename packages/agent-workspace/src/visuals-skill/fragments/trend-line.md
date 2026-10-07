# Trend line

One series over time, no fill: the shape is the story and the endpoint is the
answer, so the last point is the only value on the plot. The dashed `--chart-5`
rule is the period average — a dashed stroke is reserved for a reference and
never goes unnamed, so it carries a short label at the quiet end of the plot
rather than a legend (one series still needs no legend box).

Scale derivation for this data: the left pad is 56 because the widest tick,
`$1,500`, needs 6 × 7.6 + 8 = 53.6 (rounded up to a multiple of 4), with the
ticks right-aligned at 48. The plot box runs x 56→680, y 20→212; fourteen points
make thirteen gaps, so gap = 624/13 = 48 and x_i = 56 + 48i. The high is
$1,342, so niceStep gives step 500 and max 1500, y(v) = 212 − v/1500×192, and
the gridlines land on $0 / $500 / $1,000 / $1,500. The reference is the mean
of the fourteen values, $1,070.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Revenue finished the 14 days at $1,342, its high and about 25% above the $1,070 average.</h2>
<div style="position:relative">
  <svg viewBox="0 0 736 240" width="100%" role="img" aria-label="Daily revenue over 14 days, ending at $1,342 against a $1,070 average">
    <title>Daily revenue over 14 days, ending at $1,342</title>
    <!-- scale: padL 56 = widest tick "$1,500" 6 × 7.6 + 8, rounded up to 4; ticks right-aligned at 48
         plot box x 56→680 (right pad 56 holds the end label), y 20→212; plotW 624, plotH 192
         n = 14 points, gap = 624/(n-1) = 48, x_i = 56 + 48*i = 56, 104, … , 680
         peak $1,342 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (268.4) = 500 → max = first multiple at or above the peak = 1,500 → step 500 · max 1500, y(v) = 212 - v/1500*192
         ticks $0 / $500 / $1,000 / $1,500 at y 212 / 148 / 84 / 20
         the reference sits at the mean $1,070 → y 75, labelled at the left where the series runs low -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="56" y1="212" x2="680" y2="212" stroke="var(--chart-grid)" stroke-width="1"/><text x="48" y="212" text-anchor="end" dominant-baseline="middle">$0</text>
      <line x1="56" y1="148" x2="680" y2="148" stroke="var(--chart-grid)" stroke-width="1"/><text x="48" y="148" text-anchor="end" dominant-baseline="middle">$500</text>
      <line x1="56" y1="84" x2="680" y2="84" stroke="var(--chart-grid)" stroke-width="1"/><text x="48" y="84" text-anchor="end" dominant-baseline="middle">$1,000</text>
      <line x1="56" y1="20" x2="680" y2="20" stroke="var(--chart-grid)" stroke-width="1"/><text x="48" y="20" text-anchor="end" dominant-baseline="middle">$1,500</text>
      <text x="56" y="230" text-anchor="middle">Sep 8</text>
      <text x="200" y="230" text-anchor="middle">Sep 11</text>
      <text x="344" y="230" text-anchor="middle">Sep 14</text>
      <text x="488" y="230" text-anchor="middle">Sep 17</text>
      <text x="632" y="230" text-anchor="middle">Sep 20</text>
      <line x1="56" y1="75" x2="680" y2="75" stroke="var(--chart-5)" stroke-width="2" stroke-dasharray="4 4"/>
      <text x="60" y="67" fill="var(--muted-foreground)">avg $1,070</text>
      <polyline points="56,99.6 104,79.5 152,63.5 200,96.5 248,105.6 296,82.8 344,56.7 392,72.7 440,89.9 488,68.5 536,49.7 584,85.8 632,59.2 680,40.2" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line class="crosshair" x1="56" y1="20" x2="56" y2="212" stroke="var(--border-strong)" stroke-width="1" visibility="hidden"/>
      <circle cx="680" cy="40.2" r="4" fill="var(--chart-1)" stroke="var(--background)" stroke-width="2"/>
      <text x="689.9" y="40.2" dominant-baseline="middle" fill="var(--foreground)" font-weight="500" style="font-variant-numeric: tabular-nums">$1,342</text>
      <rect x="32" y="20" width="48" height="192" fill="transparent" data-label="Sep 8" data-value="$878" data-x="56"/>
      <rect x="80" y="20" width="48" height="192" fill="transparent" data-label="Sep 9" data-value="$1,035" data-x="104"/>
      <rect x="128" y="20" width="48" height="192" fill="transparent" data-label="Sep 10" data-value="$1,160" data-x="152"/>
      <rect x="176" y="20" width="48" height="192" fill="transparent" data-label="Sep 11" data-value="$902" data-x="200"/>
      <rect x="224" y="20" width="48" height="192" fill="transparent" data-label="Sep 12" data-value="$831" data-x="248"/>
      <rect x="272" y="20" width="48" height="192" fill="transparent" data-label="Sep 13" data-value="$1,009" data-x="296"/>
      <rect x="320" y="20" width="48" height="192" fill="transparent" data-label="Sep 14" data-value="$1,213" data-x="344"/>
      <rect x="368" y="20" width="48" height="192" fill="transparent" data-label="Sep 15" data-value="$1,088" data-x="392"/>
      <rect x="416" y="20" width="48" height="192" fill="transparent" data-label="Sep 16" data-value="$954" data-x="440"/>
      <rect x="464" y="20" width="48" height="192" fill="transparent" data-label="Sep 17" data-value="$1,121" data-x="488"/>
      <rect x="512" y="20" width="48" height="192" fill="transparent" data-label="Sep 18" data-value="$1,268" data-x="536"/>
      <rect x="560" y="20" width="48" height="192" fill="transparent" data-label="Sep 19" data-value="$986" data-x="584"/>
      <rect x="608" y="20" width="48" height="192" fill="transparent" data-label="Sep 20" data-value="$1,194" data-x="632"/>
      <rect x="656" y="20" width="48" height="192" fill="transparent" data-label="Sep 21" data-value="$1,342" data-x="680"/>
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

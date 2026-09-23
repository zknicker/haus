# Area

One series where the volume is the point — money accumulated, hours logged,
stock on hand. The fill is the whole difference from a trend line, so keep it a
wash: `color-mix(in srgb, var(--chart-1) 12%, transparent)` under a 2px line.
Never stack two areas here; two volumes that overlap are a multi-line chart.

Scale derivation for this data: plot box x 48→680 (the right pad holds the end
label) and y 20→212. Fourteen points are fourteen positions but thirteen gaps,
so gap = 632/13 = 48.6 and x_i = 48 + 48.6i. The high is $282, so niceStep
gives step 100 and max 300, y(v) = 212 − v/300×192, and the gridlines land on
$0 / $100 / $200 / $300. Only the last point is labelled; the crosshair and
the tip carry the other thirteen.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Royalties totalled $2,958 over the 14 days and finished at their high of $282 a day.</h2>
<div style="position:relative">
  <svg viewBox="0 0 736 240" width="100%" role="img" aria-label="Daily royalties over 14 days, totalling $3,058 and ending at its high of $282">
    <title>Daily royalties over 14 days, ending at a high of $282</title>
    <!-- scale: plot box x 48→680 (right pad 56 holds the end label), y 20→212; plotW 632, plotH 192
         n = 14 points, gap = 632/(n-1) = 48.6, x_i = 48 + 48.6*i = 48, 96.6, … , 680
         peak $282 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (56.4) = 100 → max = first multiple at or above the peak = 300 → step 100 · max 300, y(v) = 212 - v/300*192
         ticks $0 / $100 / $200 / $300 at y 212 / 148 / 84 / 20; every third day is labelled so the band never crowds
         each hit rect is one slot wide (48.6) and the full plot height, so the crosshair snaps to the nearest day -->
    <g font-family="var(--font-sans)" font-size="12" fill="var(--chart-label)">
      <line x1="48" y1="212" x2="680" y2="212" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="212" text-anchor="end" dominant-baseline="middle">$0</text>
      <line x1="48" y1="148" x2="680" y2="148" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="148" text-anchor="end" dominant-baseline="middle">$100</text>
      <line x1="48" y1="84" x2="680" y2="84" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="84" text-anchor="end" dominant-baseline="middle">$200</text>
      <line x1="48" y1="20" x2="680" y2="20" stroke="var(--chart-grid)" stroke-width="1"/><text x="40" y="20" text-anchor="end" dominant-baseline="middle">$300</text>
      <text x="48" y="230" text-anchor="middle">Sep 8</text>
      <text x="193.8" y="230" text-anchor="middle">Sep 11</text>
      <text x="339.7" y="230" text-anchor="middle">Sep 14</text>
      <text x="485.5" y="230" text-anchor="middle">Sep 17</text>
      <text x="631.4" y="230" text-anchor="middle">Sep 20</text>
      <path d="M 48,99.4 L 96.6,78.2 L 145.2,61 L 193.8,94.9 L 242.5,104.5 L 291.1,80.8 L 339.7,55.2 L 388.3,72.5 L 436.9,89.8 L 485.5,63.5 L 534.2,44.3 L 582.8,81.4 L 631.4,53.9 L 680,31.5 V 212 H 48 Z" fill="color-mix(in srgb, var(--chart-1) 12%, transparent)"/>
      <polyline points="48,99.4 96.6,78.2 145.2,61 193.8,94.9 242.5,104.5 291.1,80.8 339.7,55.2 388.3,72.5 436.9,89.8 485.5,63.5 534.2,44.3 582.8,81.4 631.4,53.9 680,31.5" fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line class="crosshair" x1="48" y1="20" x2="48" y2="212" stroke="var(--border-strong)" stroke-width="1" visibility="hidden"/>
      <circle cx="680" cy="31.5" r="4" fill="var(--chart-1)" stroke="var(--background)" stroke-width="2"/>
      <text x="690" y="31.5" dominant-baseline="middle" fill="var(--foreground)" font-weight="500" style="font-variant-numeric: tabular-nums">$282</text>
      <rect x="23.7" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 8" data-value="$176" data-x="48"/>
      <rect x="72.3" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 9" data-value="$209" data-x="96.6"/>
      <rect x="120.9" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 10" data-value="$236" data-x="145.2"/>
      <rect x="169.5" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 11" data-value="$183" data-x="193.8"/>
      <rect x="218.2" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 12" data-value="$168" data-x="242.5"/>
      <rect x="266.8" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 13" data-value="$205" data-x="291.1"/>
      <rect x="315.4" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 14" data-value="$245" data-x="339.7"/>
      <rect x="364" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 15" data-value="$218" data-x="388.3"/>
      <rect x="412.6" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 16" data-value="$191" data-x="436.9"/>
      <rect x="461.2" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 17" data-value="$232" data-x="485.5"/>
      <rect x="509.8" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 18" data-value="$262" data-x="534.2"/>
      <rect x="558.5" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 19" data-value="$204" data-x="582.8"/>
      <rect x="607.1" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 20" data-value="$247" data-x="631.4"/>
      <rect x="655.7" y="20" width="48.6" height="192" fill="transparent" data-label="Sep 21" data-value="$282" data-x="680"/>
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

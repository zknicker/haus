# Report

The composed answer to a many-faceted question — "how did the week go", "my
weekly report": a stat row, a full-width time series, and side-by-side ranked
lists, each panel titled. Keep the order; swap the panels' data, measures, and
titles. The `<style>` block is the whole responsive layer: below 560px the stat
row wraps to 2×2 and the paired lists stack to one column, while the fluid plot
and the HTML rows reflow on their own.

Stats are a value and a muted caption, nothing else — no plate, no chip. Add a
change only when the question asks about change, as one more 12px
`--muted-foreground` line (`↓ 0.7% vs prior 7d`), never a tinted pill. No hover
layer: the peak and the latest carry direct labels, and the reply carries the
takeaway.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">A flat week: $6,630 in US revenue, the grandson baseball tee on top, and the US carrying 93% of sales.</h2>
<style>
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gap-md); }
  .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap-lg); }
  @media (max-width: 560px) {
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pair { grid-template-columns: minmax(0, 1fr); }
  }
</style>
<div style="display:flex;flex-direction:column;gap:var(--gap-lg)">
  <div class="stats">
    <div><div style="font-size:30px;font-weight:500;line-height:1.1">$6,630</div><div style="margin-top:2px;font-size:12px;color:var(--muted-foreground)">Revenue · 7d</div></div>
    <div><div style="font-size:30px;font-weight:500;line-height:1.1">$1,461</div><div style="margin-top:2px;font-size:12px;color:var(--muted-foreground)">Royalties · 7d</div></div>
    <div><div style="font-size:30px;font-weight:500;line-height:1.1">319</div><div style="margin-top:2px;font-size:12px;color:var(--muted-foreground)">Net units · 7d</div></div>
    <div><div style="font-size:30px;font-weight:500;line-height:1.1">$14.4K</div><div style="margin-top:2px;font-size:12px;color:var(--muted-foreground)">Revenue · MTD</div></div>
  </div>
  <div>
    <div style="font-size:14px;font-weight:500;margin-bottom:var(--gap-sm)">US revenue per week</div>
    <div style="display:flex">
      <svg width="56" height="200" aria-hidden="true" style="flex:none;font-family:var(--font-sans)">
        <g font-size="12" fill="var(--chart-label)" style="font-variant-numeric: tabular-nums">
          <text x="48" y="172" text-anchor="end" dominant-baseline="middle">$0</text>
          <text x="48" y="135" text-anchor="end" dominant-baseline="middle">$2,000</text>
          <text x="48" y="98" text-anchor="end" dominant-baseline="middle">$4,000</text>
          <text x="48" y="61" text-anchor="end" dominant-baseline="middle">$6,000</text>
          <text x="48" y="24" text-anchor="end" dominant-baseline="middle">$8,000</text>
        </g>
      </svg>
      <svg width="100%" height="200" role="img" aria-label="US revenue per week, down from $7,175 in late August to a steady $6,630" style="flex:1 1 0;min-width:0;font-family:var(--font-sans)">
        <title>US revenue per week</title>
        <!-- scale: fluid plot, 200px tall; gutter 56px for "$8,000"; n = 4, slot 25%, bar = min(60/4, 10) = 10%
           peak $7,175 → step = smallest of 1, 2, 5 × 10^k at or above peak/5 (1,435) = 2,000 → max = first multiple at or above the peak = 8,000 → step 2000 · max 8000, y(v) = 172 - v/8000*148 -->
        <g font-size="12" fill="var(--chart-label)">
          <line x1="0" y1="172" x2="100%" y2="172" stroke="var(--chart-grid)" stroke-width="1"/>
          <line x1="0" y1="135" x2="100%" y2="135" stroke="var(--chart-grid)" stroke-width="1"/>
          <line x1="0" y1="98" x2="100%" y2="98" stroke="var(--chart-grid)" stroke-width="1"/>
          <line x1="0" y1="61" x2="100%" y2="61" stroke="var(--chart-grid)" stroke-width="1"/>
          <line x1="0" y1="24" x2="100%" y2="24" stroke="var(--chart-grid)" stroke-width="1"/>
          <text x="12.5%" y="190" text-anchor="middle">Aug 18–24</text>
          <text x="37.5%" y="190" text-anchor="middle">Aug 25–31</text>
          <text x="62.5%" y="190" text-anchor="middle">Sep 1–7</text>
          <text x="87.5%" y="190" text-anchor="middle">Sep 8–14</text>
          <svg x="7.5%" y="39.3" width="10%" height="132.7"><rect width="100%" height="136.7" rx="4" fill="var(--chart-5)"/></svg>
          <svg x="32.5%" y="48.8" width="10%" height="123.2"><rect width="100%" height="127.2" rx="4" fill="var(--chart-5)"/></svg>
          <svg x="57.5%" y="48.5" width="10%" height="123.5"><rect width="100%" height="127.5" rx="4" fill="var(--chart-5)"/></svg>
          <svg x="82.5%" y="49.3" width="10%" height="122.7"><rect width="100%" height="126.7" rx="4" fill="var(--chart-1)"/></svg>
          <text x="12.5%" y="31.3" text-anchor="middle" fill="var(--foreground)" font-weight="500" style="font-variant-numeric: tabular-nums">$7,175</text>
          <text x="92.5%" y="41.3" text-anchor="end" fill="var(--foreground)" font-weight="500" style="font-variant-numeric: tabular-nums">$6,630</text>
        </g>
      </svg>
    </div>
</div>
  </div>
  <div class="pair">
    <div>
      <div style="font-size:14px;font-weight:500;margin-bottom:var(--gap-sm)">Top designs · 7d</div>
      <div role="img" aria-label="Top four designs by revenue, grandson baseball first at $234" style="display:grid;grid-template-columns:fit-content(40%) minmax(0,1fr);gap:8px 12px;align-items:center;font-size:13px">
        <span title="That's My Grandson Out There Baseball Grandma" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Grandson baseball</span>
        <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 1);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$234</span></span>
        <span title="Mama Bee Shirt Family Bee First Bee Day Outfits" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Mama bee family</span>
        <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.855);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$200</span></span>
        <span title="Family Bee Shirts Dad Daddy First Bee Day Outfit" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Dad bee family</span>
        <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.684);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$160</span></span>
        <span title="Mermaid Security Shirt Swimmer Dad Merdad Trident" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Mermaid security</span>
        <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.684);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$160</span></span>
      </div>
    </div>
    <div>
      <div style="font-size:14px;font-weight:500;margin-bottom:var(--gap-sm)">Marketplaces · 7d in USD</div>
      <div role="img" aria-label="Revenue by marketplace, the US at $6,630 of about $7,141" style="display:grid;grid-template-columns:fit-content(40%) minmax(0,1fr);gap:8px 12px;align-items:center;font-size:13px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">US</span>
        <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 56px) * 1);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$6,630</span></span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">DE · €238</span>
        <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 56px) * 0.039);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$257</span></span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">GB · £200</span>
        <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 56px) * 0.038);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$254</span></span>
      </div>
    </div>
  </div>
</div>
```

# Ranked horizontal bar

Top N, sorted, name on the left, a 28px bar, and the value muted **right after
the bar end** — the shape people actually read a leaderboard in. No value axis:
every row carries its value, so gridlines would only add ink, and the eye reads
each number where its bar stops instead of hopping to a far-right column.

It is HTML rows, not SVG, so it reflows at any width with real-size text: the
names column is `fit-content(40%)` and truncates, keeping the full title on
hover through `title`. Every bar shares one scale — `(100% − reserve) × v/leader`
— where `reserve` is the widest value's width (7.6px a character at 12px) plus
the 8px gap, so the leader's value still fits after its bar. Six rows at most in
a report panel; past about ten, send the tail to a table.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The grandson baseball tee leads the last seven days at $234, about 17% ahead of the next product.</h2>
<div role="img" aria-label="Top eight products by revenue over seven days, led by the grandson baseball tee at $234" style="display:grid;grid-template-columns:fit-content(40%) minmax(0,1fr);gap:8px 12px;align-items:center;font-size:13px">
  <!-- scale: HTML rows, so the list reflows at any width with 28px bars and real-size text; no value axis — every row carries its value.
       names: fit-content(40%), truncated with the full title on hover; bars share one scale, width = (track − reserve) × v/leader,
       reserve 40px = widest value "$234" (4 chars × 7.6) + the 8px gap, so the leader's value still fits after its bar
       leader $234 → 1; $200 → 0.855; $81 → 0.346; the value sits 8px after each bar end -->
  <span title="That's My Grandson Out There Baseball Grandma" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Grandson baseball</span>
  <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 1);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$234</span></span>
  <span title="Mama Bee Shirt Family Bee First Bee Day Outfits" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Mama bee family</span>
  <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.855);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$200</span></span>
  <span title="Family Bee Shirts Dad Daddy First Bee Day Outfit" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Dad bee family</span>
  <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.684);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$160</span></span>
  <span title="Mermaid Security Shirt Swimmer Dad Merdad Trident" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Mermaid security</span>
  <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.684);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$160</span></span>
  <span title="Halloween Ghost Reading Read More Books Librarian" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Ghost reading</span>
  <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.393);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$92</span></span>
  <span title="I Need Baseball And Jesus Sports Mom Gift" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Baseball and Jesus</span>
  <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.363);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$85</span></span>
  <span title="I'm Not Gay I'm Super Gay LGBT Pride Rainbow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Super gay pride</span>
  <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.363);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$85</span></span>
  <span title="Boss Of The Toss Funny Cornhole Gifts For Men" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Boss of the toss</span>
  <span style="display:flex;align-items:center;gap:8px"><span style="flex:none;width:calc((100% - 40px) * 0.346);min-width:2px;height:28px;border-radius:0 4px 4px 0;background:var(--chart-1)"></span><span style="flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums">$81</span></span>
</div>
```

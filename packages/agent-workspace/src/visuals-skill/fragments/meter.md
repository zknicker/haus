# Meter

Spend against budget. Track and fill share a hue; the breached row turns
`--error` and says so in words.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Holiday push is $80 over its September budget; the other three campaigns are inside theirs.</h2>
<div style="display:grid;gap:var(--gap-md)" id="meters"></div>
<script>
const campaigns = [
  { budget: 700, name: 'Holiday push', spend: 780 },
  { budget: 600, name: 'Bee family', spend: 530 },
  { budget: 600, name: 'Harvest tees', spend: 410 },
  { budget: 400, name: 'Dog lovers', spend: 290 }
];
const money = (value) => '$' + Math.round(value).toLocaleString();
const host = document.getElementById('meters');
for (const campaign of campaigns) {
  const over = campaign.spend > campaign.budget;
  const fill = Math.min(100, Math.round((campaign.spend / campaign.budget) * 100));
  const row = document.createElement('div');
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:var(--gap-sm);margin-bottom:6px';
  const name = document.createElement('span');
  name.textContent = campaign.name;
  const figures = document.createElement('span');
  figures.style.cssText = 'margin-left:auto;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums';
  figures.textContent = money(campaign.spend) + ' of ' + money(campaign.budget);
  head.append(name, figures);
  if (over) {
    const chip = document.createElement('span');
    chip.style.cssText = 'padding:1px 8px;border-radius:var(--radius);font-size:12px;background:var(--error-bg);color:var(--error-foreground)';
    chip.textContent = money(campaign.spend - campaign.budget) + ' over';
    head.append(chip);
  }
  const track = document.createElement('div');
  track.style.cssText = 'height:8px;border-radius:var(--radius);background:color-mix(in srgb, var(--chart-1) 14%, transparent);overflow:hidden';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:100%;border-radius:var(--radius);width:' + fill + '%';
  bar.style.background = over ? 'var(--error)' : 'var(--chart-1)';
  track.append(bar);
  row.append(head, track);
  host.append(row);
}
</script>
```

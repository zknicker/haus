# Donut

Part-to-whole at a glance, never for comparing close values — two slices within
a few percent of each other are a ranked bar. Six slices is the ceiling, the
total sits in the middle, and the percentages live in the legend.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Tees are 58% of the 1,450 units sold over the 30 days; everything else trails well behind.</h2>
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--gap-lg)">
  <div style="position:relative;width:200px;height:200px;flex:0 0 auto">
    <canvas id="mixdonut" role="img" aria-label="Unit mix over 30 days: tees 58%, hoodies 17%, tanks 11%, mugs 8%, totes 6%">Tees 841, hoodies 247, tanks 160, mugs 116, totes 86.</canvas>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
      <div style="font-size:24px;font-weight:500;line-height:1.1">1,450</div>
      <div style="font-size:12px;color:var(--muted-foreground)">units</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:var(--gap-xs) var(--gap-sm);flex:1 1 260px">
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Tees 58%</span>
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 80%, transparent)"></span>Hoodies 17%</span>
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 62%, transparent)"></span>Tanks 11%</span>
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 46%, transparent)"></span>Mugs 8%</span>
    <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 33%, transparent)"></span>Totes 6%</span>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, ground] = ['--chart-1', '--background'].map(token);
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fade = (color, alpha) => {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const pixel = probe.getImageData(0, 0, 1, 1).data;
  return 'rgba(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + alpha + ')';
};
const slices = [
  { name: 'Tees', units: 841 },
  { name: 'Hoodies', units: 247 },
  { name: 'Tanks', units: 160 },
  { name: 'Mugs', units: 116 },
  { name: 'Totes', units: 86 }
];
const total = slices.reduce((sum, slice) => sum + slice.units, 0);
new Chart(document.getElementById('mixdonut'), {
  type: 'doughnut',
  data: { labels: slices.map((slice) => slice.name), datasets: [{ data: slices.map((slice) => slice.units), backgroundColor: [1, 0.8, 0.62, 0.46, 0.33].map((alpha) => fade(c1, alpha)), borderColor: ground, borderWidth: 2 }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    cutout: '62%',
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.label + ': ' + Math.round(item.parsed).toLocaleString() + ' units, ' + Math.round((item.parsed / total) * 100) + '%' } } }
  }
});
</script>
```

# Stacked bar

How the mix shifts. A stack is one measure cut up, not several independent
things, so it takes one hue in sequential steps — 100%, 60%, 35% — and never
the categorical hues. Canvas cannot parse `color-mix()`, so the steps come from
the alpha helper. Change the series, the labels, and the legend totals; the
legend is the only place the numbers appear, so no bar needs one on it.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">The US carries about 78% of revenue every month, and all three marketplaces grew into September.</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>US $27.5K</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 60%, transparent)"></span>GB $4.3K</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:color-mix(in srgb, var(--chart-1) 35%, transparent)"></span>DE $3.6K</span>
</div>
<div style="position:relative;height:250px">
  <canvas id="mix" role="img" aria-label="Monthly revenue split by marketplace, the US holding about 78% of the total every month">US $27.5K, GB $4.3K, DE $3.6K over six months.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, grid, label, font] = ['--chart-1', '--chart-grid', '--chart-label', '--font-sans'].map(token);
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fade = (color, alpha) => {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const pixel = probe.getImageData(0, 0, 1, 1).data;
  return 'rgba(' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + alpha + ')';
};
const money = (value) => '$' + Math.round(value).toLocaleString();
const series = { DE: [520, 560, 610, 590, 640, 700], GB: [640, 710, 680, 720, 760, 810], US: [4120, 4380, 4650, 4410, 4820, 5130] };
const bar = (name, alpha) => ({ backgroundColor: fade(c1, alpha), borderColor: 'transparent', borderSkipped: false, borderWidth: 2, data: series[name], label: name, maxBarThickness: 48 });
const stackTop = { ...bar('DE', 0.35), borderRadius: { topLeft: 4, topRight: 4 } };
new Chart(document.getElementById('mix'), {
  type: 'bar',
  data: { labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], datasets: [bar('US', 1), bar('GB', 0.6), stackTop] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + money(item.parsed.y) } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.55 } },
    scales: {
      x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 } } },
      y: { stacked: true, beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  }
});
</script>
```

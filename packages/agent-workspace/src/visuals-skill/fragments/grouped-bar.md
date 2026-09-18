# Grouped bar

This period against the prior one: two series, so a hand-built legend.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Last week's revenue beat the prior week every day but Tuesday.</h2>
<div style="display:flex;gap:16px;margin-bottom:8px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Last week $6,940</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:10px;border-radius:calc(var(--radius) / 3);background:var(--chart-5)"></span>Prior week $6,545</span>
</div>
<div style="position:relative;height:250px">
  <canvas id="wk" role="img" aria-label="Daily revenue, last week ahead of the prior week every day but Tuesday">Last week $6,940, prior week $6,545.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c5, grid, label, font] = ['--chart-1', '--chart-5', '--chart-grid', '--chart-label', '--font-sans'].map(token);
const money = (value) => '$' + Math.round(value).toLocaleString();
new Chart(document.getElementById('wk'), {
  type: 'bar',
  data: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      { label: 'Last week', data: [1061, 1014, 884, 1015, 866, 938, 1162], backgroundColor: c1, borderRadius: 4, maxBarThickness: 48 },
      { label: 'Prior week', data: [932, 1162, 858, 983, 741, 732, 1137], backgroundColor: c5, borderRadius: 4, maxBarThickness: 48 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + money(item.parsed.y) } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.55 } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 } } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  }
});
</script>
```

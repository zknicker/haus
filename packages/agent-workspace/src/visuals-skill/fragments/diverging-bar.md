# Diverging bar

Movement above and below a baseline: `--chart-1` for up, `--chart-2` for down,
and a `--chart-5` line at zero. The axis is the change, not the level, so the
label says so.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Four products gained on last week and two lost; the mermaid tee swung furthest, down $84.</h2>
<div style="position:relative;height:320px">
  <canvas id="delta" role="img" aria-label="Revenue change against last week per product, four up and two down, the mermaid tee furthest down at minus $84">Grandson tee +$62, bee family +$48, cornhole +$31, ghost reading +$12, dog lovers -$37, mermaid -$84.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c2, c5, grid, label, font] = ['--chart-1', '--chart-2', '--chart-5', '--chart-grid', '--chart-label', '--font-sans'].map(token);
const rows = [
  { change: 62, title: 'Grandson baseball tee' },
  { change: 48, title: 'Bee family tee' },
  { change: 31, title: 'Cornhole tee' },
  { change: 12, title: 'Ghost reading tee' },
  { change: -37, title: 'Dog lovers tee' },
  { change: -84, title: 'Mermaid security tee' }
];
const signed = (value) => (value === 0 ? '$0' : (value < 0 ? '-$' : '+$') + Math.abs(Math.round(value)).toLocaleString());
new Chart(document.getElementById('delta'), {
  type: 'bar',
  data: { labels: rows.map((row) => row.title), datasets: [{ data: rows.map((row) => row.change), backgroundColor: rows.map((row) => (row.change < 0 ? c2 : c1)), borderRadius: 4, maxBarThickness: 48 }] },
  options: {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => signed(item.parsed.x) + ' against last week' } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.7 } },
    scales: {
      x: { grid: { color: (context) => (context.tick.value === 0 ? c5 : grid), lineWidth: (context) => (context.tick.value === 0 ? 1.5 : 1) }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 7, callback: (value) => signed(value) } },
      y: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 } } }
    }
  }
});
</script>
```

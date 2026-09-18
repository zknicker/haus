# Emphasis bar

One series, one question: the asked-about period in `--chart-1`, its history in
`--chart-5`, and the single label on the mark that answers it.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Last week brought in $8,100, the shop's best week since July.</h2>
<div style="position:relative;height:250px">
  <canvas id="weeks" role="img" aria-label="Weekly revenue across eight weeks, last week the highest at $8,100">Weekly revenue: $6,180, $5,940, $6,720, $6,410, $7,050, $6,880, $7,320, $8,100.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c5, grid, label, ink, font] = ['--chart-1', '--chart-5', '--chart-grid', '--chart-label', '--foreground', '--font-sans'].map(token);
const weeks = ['Jul 21', 'Jul 28', 'Aug 4', 'Aug 11', 'Aug 18', 'Aug 25', 'Sep 1', 'Sep 8'];
const revenue = [6180, 5940, 6720, 6410, 7050, 6880, 7320, 8100];
const focus = revenue.length - 1;
const money = (value) => '$' + Math.round(value).toLocaleString();
const callout = {
  id: 'callout',
  afterDatasetsDraw(chart) {
    const bar = chart.getDatasetMeta(0).data[focus];
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '500 12px ' + font;
    ctx.textAlign = 'center';
    ctx.fillText(money(revenue[focus]), bar.x, bar.y - 8);
    ctx.restore();
  }
};
new Chart(document.getElementById('weeks'), {
  type: 'bar',
  data: { labels: weeks, datasets: [{ data: revenue, backgroundColor: revenue.map((_, index) => (index === focus ? c1 : c5)), borderRadius: 4, maxBarThickness: 48 }] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { top: 20 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => money(item.parsed.y) } } },
    datasets: { bar: { barPercentage: 0.9, categoryPercentage: 0.55 } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { autoSkip: false, color: label, font: { family: font, size: 12 }, maxRotation: 45 } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  },
  plugins: [callout]
});
</script>
```

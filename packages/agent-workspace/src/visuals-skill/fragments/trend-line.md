# Trend line

One series with a dashed average reference line. The reference gets a legend
entry — a dashed stroke means nothing unnamed — and the endpoint carries the
one label, ringed in the backdrop so it sits above the line.

```html
<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Revenue finished the 30 days at $1,088, about 11% above the period average of $976.</h2>
<div style="display:flex;gap:16px;margin-bottom:8px">
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-1)"></span>Daily revenue</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-foreground)"><span style="width:10px;height:2px;border-radius:calc(var(--radius) / 3);background:var(--chart-5)"></span>30-day average $976</span>
</div>
<div style="position:relative;height:250px">
  <canvas id="trend" role="img" aria-label="Daily revenue over 30 days, ending at $1,088 against a $976 average">Daily revenue ranged $654 to $1,434 and ended at $1,088; the average was $976.</canvas>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"></script>
<script>
const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const [c1, c5, grid, label, ink, ground, font] = ['--chart-1', '--chart-5', '--chart-grid', '--chart-label', '--foreground', '--background', '--font-sans'].map(token);
const days = ['Aug 17', 'Aug 18', 'Aug 19', 'Aug 20', 'Aug 21', 'Aug 22', 'Aug 23', 'Aug 24', 'Aug 25', 'Aug 26', 'Aug 27', 'Aug 28', 'Aug 29', 'Aug 30', 'Aug 31', 'Sep 1', 'Sep 2', 'Sep 3', 'Sep 4', 'Sep 5', 'Sep 6', 'Sep 7', 'Sep 8', 'Sep 9', 'Sep 10', 'Sep 11', 'Sep 12', 'Sep 13', 'Sep 14', 'Sep 15'];
const revenue = [811, 654, 925, 1086, 1434, 1281, 873, 922, 991, 704, 856, 1073, 1049, 812, 744, 918, 1002, 869, 1124, 1288, 947, 806, 878, 1035, 1160, 902, 831, 1009, 1213, 1088];
const money = (value) => '$' + Math.round(value).toLocaleString();
const average = Math.round(revenue.reduce((sum, value) => sum + value, 0) / revenue.length);
const last = revenue.length - 1;
const endLabel = {
  id: 'endLabel',
  afterDatasetsDraw(chart) {
    const point = chart.getDatasetMeta(0).data[last];
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = '500 12px ' + font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(money(revenue[last]), point.x + 10, point.y);
    ctx.restore();
  }
};
new Chart(document.getElementById('trend'), {
  type: 'line',
  data: {
    labels: days,
    datasets: [
      { label: 'Daily revenue', data: revenue, borderColor: c1, borderWidth: 2, tension: 0, pointRadius: revenue.map((_, index) => (index === last ? 4 : 0)), pointHoverRadius: 4, pointBackgroundColor: c1, pointBorderColor: ground, pointBorderWidth: 2, hitRadius: 12 },
      { label: '30-day average', data: revenue.map(() => average), borderColor: c5, borderWidth: 2, borderDash: [4, 4], tension: 0, pointRadius: 0, pointHoverRadius: 0 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    layout: { padding: { right: 52 } },
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + money(item.parsed.y) } } },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxRotation: 0, maxTicksLimit: 6 } },
      y: { beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: label, font: { family: font, size: 12 }, maxTicksLimit: 5, callback: (value) => money(value) } }
    }
  },
  plugins: [endLabel]
});
</script>
```

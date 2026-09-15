export const visualReportHtml = `
<style>
.kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; }
.kpis article { padding:12px; background:var(--surface-secondary); }
</style>
<h2>Responsive sales report</h2>
<div class="kpis">
<article>Revenue<br>$125,000</article><article>Orders<br>2,400</article>
<article>Customers<br>1,800</article><article>Margin<br>42%</article>
<article>Returns<br>2%</article>
</div>
<button onclick="document.getElementById('details').style.height='2200px'">Tall report</button>
<button onclick="document.getElementById('details').style.height='600px'">Medium report</button>
<button onclick="document.getElementById('details').style.height='40px'">Short report</button>
<button onclick="setTimeout(()=>document.getElementById('details').style.height='2200px',2000)">Delayed tall</button>
<button onclick="setTimeout(()=>document.getElementById('details').style.height='40px',2000)">Delayed short</button>
<div id="details" style="height:600px">Report details</div>
<table style="min-width:1400px"><caption>Wide sales table</caption><tbody><tr>
<td>First column</td><td>Last column</td></tr></tbody></table>
<p>Report end</p>`;

export const visualReportMessage = `Report introduction\n\n\`\`\`visual Responsive sales report\n${visualReportHtml}\n\`\`\`\n\nReport conclusion`;

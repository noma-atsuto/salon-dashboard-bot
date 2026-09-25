<script>
const P = JSON.parse(document.getElementById('payload').textContent);
const T = P.target;
const yen = n => Math.round(n).toLocaleString('ja-JP');
const pct = n => n.toFixed(1) + '%';
const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const complete = P.months.filter(m => !P.data[m].partial);
let view = 'store';
let month = complete.length ? complete[complete.length - 1] : P.months[P.months.length - 1];
let person = null;

const selM = document.getElementById('m'), selS = document.getElementById('s'), lblS = document.getElementById('ls');
P.months.forEach(m => selM.add(new Option(
  m.slice(0, 4) + '年' + Number(m.slice(5)) + '月' + (P.data[m].partial ? '（集計途中）' : ''), m)));
selM.value = month;

const cur = () => P.data[month];
const prev = () => { const i = P.months.indexOf(month); return i > 0 ? P.data[P.months[i - 1]] : null; };
const stylists = () => cur().stylists;

function delta(a, b, invert) {
  if (!b) return '';
  const d = (a - b) / b * 100;
  if (Math.abs(d) < 0.5) return '<span class="d">前月比 ±0%</span>';
  const good = invert ? d < 0 : d > 0;
  return `<span class="d">前月比 <span class="${good ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d.toFixed(1)}%</span></span>`;
}

/* 6ヶ月の棒グラフ（選択中の月を強調し、その値だけラベルを出す） */
function chart(key, isStore, unit) {
  const vals = P.months.map(m => isStore ? P.data[m].store[key]
    : ((P.data[m].stylists.find(s => s.name === person) || {})[key] || 0));
  const max = Math.max(...vals, 1);
  const W = 100, H = 26, pad = 1.6, n = vals.length;
  const bw = (W - pad * (n - 1)) / n;
  let bars = '', labs = '';
  vals.forEach((v, i) => {
    const h = Math.max(1, v / max * (H - 7));
    const x = i * (bw + pad), y = H - h;
    const on = P.months[i] === month;
    bars += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}"
      rx=".8" fill="var(--${on ? 'accent' : 'line'})"></rect>`;
    if (on) bars += `<text x="${(x + bw / 2).toFixed(2)}" y="${(y - 1.8).toFixed(2)}"
      text-anchor="middle" font-size="3.6" font-weight="700" fill="var(--accent)">${yen(v)}${unit || ''}</text>`;
    labs += `<text x="${(x + bw / 2).toFixed(2)}" y="${H + 4.4}" text-anchor="middle"
      font-size="3.2" fill="var(--${on ? 'ink2' : 'ink3'})" font-weight="${on ? 700 : 400}">${Number(P.months[i].slice(5))}月</text>`;
  });
  return `<svg class="chart" viewBox="-2 -6.5 ${W + 4} ${H + 12}" role="img"
    aria-label="月ごとの推移"><line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--line)"
    stroke-width=".3"></line>${bars}${labs}</svg>`;
}

function goal(label, value, target, fmt, invert) {
  const hit = invert ? value <= target : value >= target;
  const w = invert ? Math.min(100, target / Math.max(value, .01) * 100)
                   : Math.min(100, value / target * 100);
  return `<div class="g"><span class="n">${label}</span><span class="val">${fmt(value)}</span>
    <span class="tgt">目標 ${fmt(target)}${invert ? ' 以下' : ''}　${hit ? '達成' : '未達'}</span>
    <div class="track"><i class="${hit ? 'ok' : (w >= 50 ? '' : 'bad')}" style="width:${w.toFixed(1)}%"></i></div></div>`;
}

const notes = (a, c) => a.length ? `<div class="notes">${a.map(t => `<div class="note ${c}">${esc(t)}</div>`).join('')}</div>` : '';

function partial() {
  const d = cur();
  if (!d.partial) return '';
  return `<section><div class="note r"><b>この月はまだ集計の途中です。</b>
    ${Number(month.slice(5))}月1日〜${Number(d.end.slice(8))}日までの数字なので、前月比は参考としてご覧ください。</div></section>`;
}

function renderStore() {
  const d = cur(), s = d.store, pv = prev()?.store;
  let h = partial();
  h += `<div class="hero"><div class="lab">純売上</div>
    <div class="big">${yen(s.net)}<span style="font-size:.5em;font-weight:600"> 円</span></div>
    <div class="sub">${delta(s.net, pv?.net) || '&nbsp;'}　稼働 ${s.headcount}名</div>
    <div style="margin-top:14px">${chart('net', true, '円')}</div></div>`;
  h += `<div class="strip">
    <div><div class="k">客数</div><div class="v">${yen(s.customers)}</div><div class="d">${delta(s.customers, pv?.customers) || '人'}</div></div>
    <div><div class="k">客単価</div><div class="v">${yen(s.avg)}</div><div class="d">${delta(s.avg, pv?.avg) || '円'}</div></div>
    <div><div class="k">新規／再来</div><div class="v">${s.new}／${s.repeat}</div><div class="d">再来率 ${pct(s.repeat_rate)}</div></div>
  </div>`;

  const r = s.return;
  h += `<section><h2>目標に対して、いま どこにいるか</h2>
    <p class="lede">今回の施策で動かしたい4つの数字です。</p><div class="panel goal">
    ${goal('次回予約率', s.rebook_rate, T.rebook_rate, pct)}
    ${r ? goal(`リターン率（新規${r.judged}人中 ${r.returned}人が${r.days}日以内に再来）`, r.rate, T.return_rate, pct)
        : `<div class="g"><span class="n">リターン率</span><span class="val">—</span>
           <span class="tgt">この月の新規のお客様は、まだ判定できる日数（${75}日）が経っていません</span></div>`}
    ${goal('トリートメント装着率', s.treat_rate, T.treat_rate, pct)}
    ${goal('店販（お客様1人あたり・全員平均）', s.goods_per, T.goods_per, v => yen(v) + '円')}
    </div></section>`;

  h += `<section><h2>店販</h2>
    <p class="lede">お会計 ${yen(s.customers)}件のうち、${s.goods_buyers}件で店販が売れました。</p>
    <div class="strip" style="margin-top:0">
      <div><div class="k">店販売上</div><div class="v">${yen(s.goods)}</div><div class="d">${delta(s.goods, pv?.goods) || '円'}</div></div>
      <div><div class="k">買ったお客様</div><div class="v">${s.goods_buyers}<span style="font-size:.62em">人</span></div><div class="d">お客様の ${pct(s.goods_buy_rate)}</div></div>
      <div><div class="k">買った方の平均</div><div class="v">${yen(s.goods_per_buyer)}</div><div class="d">円（${s.goods_items}点・1点 ${yen(s.goods_per_item)}円）</div></div>
    </div>
    <div class="note" style="margin-top:12px">お客様1人あたり <b>${yen(s.goods_per)}円</b> は、
      買っていない方も含めた ${yen(s.customers)}人全員で割った数字です。
      実際に買ってくださった方は、平均 <b>${yen(s.goods_per_buyer)}円</b> 使っています。</div>`;
  if (d.top_goods?.length) {
    h += `<div class="tbl" style="margin-top:12px"><table><thead><tr><th>商品</th><th>点数</th><th>売上</th></tr></thead><tbody>` +
      d.top_goods.map(([k, c0, v]) => `<tr><td>${esc(k)}</td><td>${c0}</td><td>${yen(v)}円</td></tr>`).join('') +
      `</tbody></table></div>`;
  }
  h += `</section>`;

  const rs = Object.entries(s.routes || {}).sort((a, b) => b[1] - a[1]);
  const tot = rs.reduce((a, b) => a + b[1], 0) || 1;
  h += `<section><h2>ご予約はどこから入っているか</h2>
    <p class="lede">有効なご予約 ${yen(tot)}件の内訳です。</p><div class="panel routes">` +
    rs.map(([k, v]) => `<div class="r"><b>${esc(k)}</b>
      <div class="bar"><i style="width:${(v / tot * 100).toFixed(1)}%;background:var(--${k === '次回予約' ? 'good' : 'accent'})"></i></div>
      <span class="num">${v}件 ${(v / tot * 100).toFixed(1)}%</span></div>`).join('') + `</div></section>`;

  const f = d.store_feedback;
  h += `<section><h2>この月のフィードバック</h2><p class="lede">目標との差から自動で書き出しています。</p><div class="panel">`;
  if (f.good.length) h += `<h3>できていること</h3>` + notes(f.good, 'g');
  if (f.issues.length) h += `<h3>伸びしろ</h3>` + notes(f.issues, 'r');
  if (f.actions.length) h += `<h3>次の一手</h3>` + notes(f.actions, 'y');
  h += `</div></section>`;

  if (d.top_menus?.length) {
    h += `<section><h2>よく出たメニュー</h2><div class="tbl"><table><thead><tr>
      <th>メニュー</th><th>件数</th><th>売上</th></tr></thead><tbody>` +
      d.top_menus.map(([k, c0, v]) =>
        `<tr><td>${esc(k)}</td><td>${c0}</td><td>${yen(v)}円</td></tr>`).join('') +
      `</tbody></table></div></section>`;
  }
  const ps = Object.entries(s.payments || {}).sort((a, b) => b[1] - a[1]);
  const pt = ps.reduce((a, b) => a + b[1], 0) || 1;
  if (ps.length) {
    h += `<section><h2>支払い方法</h2><p class="lede">お会計 ${yen(pt)}件の内訳です。</p><div class="panel routes">` +
      ps.map(([k, v]) => `<div class="r"><b>${esc(k)}</b>
        <div class="bar"><i style="width:${(v / pt * 100).toFixed(1)}%"></i></div>
        <span class="num">${v}件 ${(v / pt * 100).toFixed(1)}%</span></div>`).join('') + `</div></section>`;
  }
  return h;
}

function renderRank() {
  const d = cur(), s = d.store;
  const cols = [
    ['純売上', x => yen(x.net) + '円'],
    ['客数', x => x.customers],
    ['客単価', x => yen(x.avg) + '円', x => x.avg >= s.avg ? 1 : 0],
    ['新規率', x => pct(x.new_rate)],
    ['指名率', x => pct(x.nom_rate)],
    ['次回予約', x => `${x.rebook}件 ${pct(x.rebook_rate)}`, x => x.rebook_rate >= T.rebook_rate ? 1 : (x.rebook_rate <= .5 ? -1 : 0)],
    ['トリートメント', x => pct(x.treat_rate), x => x.treat_rate >= T.treat_rate ? 1 : (x.treat_rate <= 1 ? -1 : 0)],
    ['リターン率', x => x.return ? pct(x.return.rate) : '—',
      x => !x.return ? 0 : (x.return.rate >= T.return_rate ? 1 : (x.return.rate <= (s.return?.rate ?? 0) * .6 ? -1 : 0))],
    ['店販売上', x => yen(x.goods) + '円'],
    ['店販を買った率', x => pct(x.goods_buy_rate), x => x.goods_buy_rate >= s.goods_buy_rate * 1.25 ? 1 : (x.goods_buy_rate <= s.goods_buy_rate * .6 ? -1 : 0)],
    ['買った方の平均', x => x.goods_buyers ? yen(x.goods_per_buyer) + '円' : '—'],
    ['店販/客（全員平均）', x => yen(x.goods_per) + '円', x => x.goods_per >= T.goods_per ? 1 : (x.goods_per < s.goods_per * .6 ? -1 : 0)],
  ];
  let h = partial();
  h += `<section><h2>スタイリスト比較</h2>
    <p class="lede">緑は目標達成または店舗平均より良いところ、赤は伸びしろがあるところです。横にスクロールできます。<br>
    「店舗全体」の行には、フリー枠など一覧に出ていないスタッフの分も含まれます。</p>
    <div class="tbl"><table><thead><tr><th>スタイリスト</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>`;
  d.stylists.forEach(x => {
    h += `<tr><td>${esc(x.name)}</td>` + cols.map(c => {
      const j = c[2] ? c[2](x) : 0;
      return `<td class="${j > 0 ? 'ok' : j < 0 ? 'bad' : ''}">${c[1](x)}</td>`;
    }).join('') + `</tr>`;
  });
  h += `<tr class="total"><td>店舗全体</td><td>${yen(s.net)}円</td><td>${s.customers}</td>
    <td>${yen(s.avg)}円</td><td>${pct(s.new_rate)}</td><td>${pct(s.nom_rate)}</td>
    <td>${s.rebook}件 ${pct(s.rebook_rate)}</td><td>${pct(s.treat_rate)}</td>
    <td>${s.return ? pct(s.return.rate) : '—'}</td><td>${yen(s.goods)}円</td>
    <td>${pct(s.goods_buy_rate)}</td><td>${yen(s.goods_per_buyer)}円</td>
    <td>${yen(s.goods_per)}円</td></tr></tbody></table></div></section>`;

  h += `<section><h2>次回予約率</h2><p class="lede">目標は10%です。</p><div class="panel routes">` +
    [...d.stylists].sort((a, b) => b.rebook_rate - a.rebook_rate).map(x =>
      `<div class="r"><b>${esc(x.name)}</b>
       <div class="bar"><i style="width:${Math.min(100, x.rebook_rate / T.rebook_rate * 100).toFixed(1)}%;
         background:var(--${x.rebook_rate >= T.rebook_rate ? 'good' : x.rebook_rate >= 3 ? 'accent' : 'warn'})"></i></div>
       <span class="num">${x.rebook}件 ${pct(x.rebook_rate)}</span></div>`).join('') + `</div></section>`;
  return h;
}

function renderPerson() {
  const d = cur(), s = d.store, x = d.stylists.find(v => v.name === person);
  if (!x) return '<section><div class="panel">この月のデータがありません。</div></section>';
  const pv = prev()?.stylists.find(v => v.name === person), f = x.feedback;
  let h = partial();
  h += `<section><div class="who"><h2>${esc(x.name)}</h2>
    ${f.tag ? `<span class="tag">${esc(f.tag)}</span>` : ''}</div></section>`;
  h += `<div class="hero"><div class="lab">純売上</div>
    <div class="big">${yen(x.net)}<span style="font-size:.5em;font-weight:600"> 円</span></div>
    <div class="sub">${delta(x.net, pv?.net) || '&nbsp;'}　担当 ${x.customers}人</div>
    <div style="margin-top:14px">${chart('net', false, '円')}</div></div>`;
  h += `<div class="strip">
    <div><div class="k">客単価</div><div class="v">${yen(x.avg)}</div><div class="d">店舗 ${yen(s.avg)}円</div></div>
    <div><div class="k">新規率／指名率</div><div class="v">${pct(x.new_rate)}／${pct(x.nom_rate)}</div><div class="d">店舗 新規 ${pct(s.new_rate)}</div></div>
    <div><div class="k">店販売上</div><div class="v">${yen(x.goods)}</div><div class="d">${x.goods_buyers}人が購入・平均${yen(x.goods_per_buyer)}円</div></div>
  </div>`;
  h += `<section><h2>目標に対して</h2><p class="lede">かっこ内は店舗全体の数字です。</p><div class="panel goal">
    ${goal(`次回予約率（店舗 ${pct(s.rebook_rate)}）`, x.rebook_rate, T.rebook_rate, pct)}
    ${x.return ? goal(`リターン率（新規${x.return.judged}人中 ${x.return.returned}人・店舗 ${s.return ? pct(s.return.rate) : '—'}）`,
        x.return.rate, T.return_rate, pct)
      : `<div class="g"><span class="n">リターン率</span><span class="val">—</span>
         <span class="tgt">まだ判定できる日数が経っていません</span></div>`}
    ${goal(`トリートメント装着率（店舗 ${pct(s.treat_rate)}）`, x.treat_rate, T.treat_rate, pct)}
    ${goal(`店販（1人あたり・全員平均／店舗 ${yen(s.goods_per)}円）`, x.goods_per, T.goods_per, v => yen(v) + '円')}
    </div></section>`;
  h += `<section><h2>フィードバック</h2><div class="panel">`;
  if (f.trend?.length) { h += `<h3>前月からの変化</h3>` + notes(f.trend.map(t => t.text), ''); }
  if (f.strengths.length) h += `<h3>強み</h3>` + notes(f.strengths, 'g');
  if (f.issues.length) h += `<h3>伸びしろ</h3>` + notes(f.issues, 'r');
  if (f.actions.length) h += `<h3>次の一手</h3>` + notes(f.actions, 'y');
  h += `</div></section>`;
  return h;
}

function render() {
  selS.innerHTML = '';
  stylists().forEach(v => selS.add(new Option(v.name, v.name)));
  if (!person || !stylists().some(v => v.name === person)) person = stylists()[0]?.name;
  if (person) selS.value = person;
  const show = view === 'person';
  selS.hidden = !show; lblS.hidden = !show;
  document.getElementById('view').innerHTML =
    view === 'store' ? renderStore() : view === 'rank' ? renderRank() : renderPerson();
  window.scrollTo({top: 0, behavior: 'instant'});
}

document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.seg button').forEach(t => t.setAttribute('aria-selected', String(t === b)));
  view = b.dataset.v; render();
}));
selM.addEventListener('change', e => { month = e.target.value; render(); });
selS.addEventListener('change', e => { person = e.target.value; render(); });
render();
</script>

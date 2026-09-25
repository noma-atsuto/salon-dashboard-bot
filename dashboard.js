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
    const tag = isStore || true ? P.months[i] : '';
    bars += `<rect class="mbar" data-m="${tag}" x="${x.toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${H}"
      fill="transparent"></rect>`;
    bars += `<rect class="mbar" data-m="${tag}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}"
      rx=".8" fill="var(--${on ? 'accent' : 'line'})"><title>${tag.slice(0,4)}年${Number(tag.slice(5))}月　${yen(v)}円</title></rect>`;
    if (on) bars += `<text x="${(x + bw / 2).toFixed(2)}" y="${(y - 1.8).toFixed(2)}"
      text-anchor="middle" font-size="3.6" font-weight="700" fill="var(--accent)">${yen(v)}${unit || ''}</text>`;
    labs += `<text class="mbar" data-m="${tag}" x="${(x + bw / 2).toFixed(2)}" y="${H + 4.4}" text-anchor="middle"
      font-size="3.2" fill="var(--${on ? 'ink2' : 'ink3'})" font-weight="${on ? 700 : 400}">${Number(P.months[i].slice(5))}月</text>`;
  });
  return `<svg class="chart" viewBox="-2 -6.5 ${W + 4} ${H + 12}" role="img"
    aria-label="月ごとの推移"><line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--line)"
    stroke-width=".3"></line>${bars}${labs}</svg>`;
}

/* 日別：グラフと一覧を切り替えられる形で返す */
function dailyBlock(rows, id) {
  if (!rows || !rows.length) return '<p class="mini">この月のデータがありません。</p>';
  return `<div class="switch">
      <button type="button" class="dtab" data-t="${id}" data-v="chart" aria-selected="true">グラフ</button>
      <button type="button" class="dtab" data-t="${id}" data-v="list" aria-selected="false">一覧</button>
    </div>
    <div id="${id}-chart">${daily(rows)}</div>
    <div id="${id}-list" hidden>${dailyTable(rows)}</div>`;
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];

function dailyTable(rows) {
  const y = Number(month.slice(0, 4)), mo = Number(month.slice(5));
  const sum = rows.reduce((a, r) => [a[0] + r[1], a[1] + r[2], a[2] + r[3], a[3] + r[4]],
                          [0, 0, 0, 0]);
  let h = `<div class="tbl"><table><thead><tr>
    <th>日付</th><th>総売上</th><th>純売上</th><th>客数</th><th>客単価</th><th>店販</th>
    </tr></thead><tbody>`;
  rows.forEach(([d, gr, v, c, g]) => {
    const w = new Date(y, mo - 1, d).getDay();
    const off = v === 0 && gr === 0;
    h += `<tr${off ? ' style="opacity:.5"' : ''}>
      <td>${mo}/${d}<span class="wd ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}">（${WD[w]}）</span></td>
      <td>${off ? '—' : yen(gr) + '円'}</td>
      <td>${off ? '—' : yen(v) + '円'}</td>
      <td>${off ? '—' : c + '人'}</td>
      <td>${c ? yen(v / c) + '円' : '—'}</td>
      <td>${g ? yen(g) + '円' : '—'}</td></tr>`;
  });
  h += `<tr class="total"><td>合計</td><td>${yen(sum[0])}円</td><td>${yen(sum[1])}円</td>
    <td>${sum[2]}人</td><td>${sum[2] ? yen(sum[1] / sum[2]) + '円' : '—'}</td>
    <td>${yen(sum[3])}円</td></tr>`;
  return h + `</tbody></table></div>`;
}

/* 日別の売上（棒グラフ） */
function daily(rows) {
  if (!rows || !rows.length) return '<p class="mini">この月のデータがありません。</p>';
  const max = Math.max(...rows.map(r => r[2]), 1);
  const W = 100, H = 26, n = rows.length, gap = 0.5;
  const bw = (W - gap * (n - 1)) / n;
  const best = rows.reduce((a, b) => b[2] > a[2] ? b : a, rows[0]);
  let bars = '', labs = '';
  rows.forEach((r, i) => {
    const [d, gr, v, c] = r;
    const h = Math.max(v > 0 ? 0.8 : 0.3, v / max * (H - 5));
    const x = i * (bw + gap);
    const top = v === best[1] && v > 0;
    bars += `<rect x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}" width="${bw.toFixed(2)}"
      height="${h.toFixed(2)}" rx=".5" fill="var(--${v === 0 ? 'line2' : top ? 'accent' : 'line'})"
      ><title>${d}日　純売上 ${yen(v)}円　${c}人</title></rect>`;
    if (d === 1 || d % 5 === 0 || i === n - 1) {
      labs += `<text x="${(x + bw / 2).toFixed(2)}" y="${H + 4}" text-anchor="middle"
        font-size="2.9" fill="var(--ink3)">${d}</text>`;
    }
  });
  const sum = rows.reduce((a, b) => a + b[2], 0);
  const open = rows.filter(r => r[2] > 0).length;
  return `<svg class="chart" viewBox="-1 -2 ${W + 2} ${H + 8}" role="img"
    aria-label="日ごとの売上"><line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--line)"
    stroke-width=".25"></line>${bars}${labs}</svg>
    <p class="mini" style="margin-top:8px">棒は純売上です。出勤 ${open}日／1日平均 ${yen(sum / Math.max(open, 1))}円　
    いちばん多かったのは ${best[0]}日の ${yen(best[2])}円（${best[3]}人）</p>`;
}

/* 売上の内訳：細かい分解 */
function detailTable(rows, unit) {
  if (!rows || !rows.length) return '<p class="mini">この月はありません。</p>';
  const tot = rows.reduce((a, r) => a + Math.abs(r[2]), 0) || 1;
  return `<div class="tbl"><table><thead><tr>
    <th>${unit || '項目'}</th><th>件数</th><th>金額</th><th>割合</th></tr></thead><tbody>` +
    rows.map(([k, c, v]) => `<tr><td>${esc(k)}</td><td>${c}</td>
      <td style="${v < 0 ? 'color:var(--warn)' : ''}">${v < 0 ? '−' : ''}${yen(Math.abs(v))}円</td>
      <td>${(Math.abs(v) / tot * 100).toFixed(1)}%</td></tr>`).join('') +
    `</tbody></table></div>`;
}

function breakdownDetail(x, id) {
  const d = x.detail || {};
  const blocks = [
    ['tech', '技術の内訳（メニューの種類ごと）', 'メニューの種類'],
    ['tech_items', '技術の内訳（メニュー名ごと）', 'メニュー名'],
    ['goods', '店販の内訳', '商品'],
    ['nominate', '指名料', '区分'],
    ['discount', '割引の内訳', 'クーポン'],
    ['points', '利用ポイント', '予約経路'],
  ].filter(b => (d[b[0]] || []).length);
  return blocks.map(([k, title, unit], i) =>
    `<h3 style="margin-top:${i ? 20 : 4}px">${title}</h3>${detailTable(d[k], unit)}`).join('');
}

/* 売上の内訳 */
function breakdown(x) {
  const rows = [
    ['技術（メニュー・クーポン）', x.tech, 'accent'],
    ['店販', x.goods, 'green'],
    ['指名料', x.nominate_fee, 'purple'],
    ['割引', x.discount, 'warn'],
    ['利用ポイント', -x.points, 'warn'],
  ].filter(r => r[1]);
  const plus = rows.filter(r => r[1] > 0).reduce((a, b) => a + b[1], 0) || 1;
  const head = `<div class="r" style="padding-bottom:9px;margin-bottom:2px;border-bottom:1px solid var(--line)">
      <b>総売上（割引前）</b><div></div>
      <span class="num" style="font-weight:700;color:var(--ink)">${yen(x.gross)}円</span></div>`;
  return `<div class="panel routes">` + head + rows.map(([k, v, c]) =>
    `<div class="r"><b>${k}</b>
      <div class="bar"><i style="width:${Math.min(100, Math.abs(v) / plus * 100).toFixed(1)}%;
        background:var(--${c})"></i></div>
      <span class="num" style="color:var(--${v < 0 ? 'warn' : 'ink2'})">${v > 0 ? '' : '−'}${yen(Math.abs(v))}円</span></div>`).join('') +
    `<div class="r" style="border-top:1px solid var(--line);padding-top:9px;margin-top:2px">
      <b>純売上</b><div></div><span class="num" style="font-weight:700;color:var(--ink)">${yen(x.net)}円</span></div>
    </div>`;
}

/* 次回予約：打った分と、その後どうなったか */
function rebookBlock(x, s) {
  const f = x.rebook_made;
  const made = f ? f.made : 0;
  const judged = f ? f.made - f.upcoming : 0;
  let h = `<div class="strip" style="margin-top:0">
    <div><div class="k">この月に取った件数</div><div class="v">${made}<span style="font-size:.62em">件</span></div>
      <div class="d">初回来店のお客様から</div></div>
    <div><div class="k">来店・会計した</div><div class="v">${f ? f.done : 0}<span style="font-size:.62em">件</span></div>
      <div class="d">${f && f.show_rate !== null ? '来店率 ' + f.show_rate.toFixed(0) + '%' : '結果はこれから'}</div></div>
    <div><div class="k">キャンセル</div><div class="v">${f ? f.cancelled : 0}<span style="font-size:.62em">件</span></div>
      <div class="d">${judged ? (f.cancelled / judged * 100).toFixed(0) + '%' : '—'}</div></div>
    <div><div class="k">来店待ち</div><div class="v">${f ? f.upcoming : 0}<span style="font-size:.62em">件</span></div>
      <div class="d">来店日がまだ先</div></div>
    <div><div class="k">取得率</div><div class="v">${f && f.take_rate !== null ? pct(f.take_rate) : '—'}</div>
      <div class="d">初回来店 ${f ? f.first_visits : 0}人のうち</div></div>
  </div>`;
  h += `<div class="note" style="margin-top:12px">
    <b>「来店待ち」</b>は、次回予約を取ったものの<b>来店日がまだ先</b>で、
    来るかキャンセルかが決まっていない分です。来店率の計算からは外しています
    （${judged}件が判定済み）。</div>`;
  h += `<div class="note" style="margin-top:9px">
    上は<b>この月に取った</b>次回予約のその後です。<br>
    いっぽう、<b>この月に来店・会計した</b>次回予約は <b>${x.rebook}件</b>（お会計の ${pct(x.rebook_rate)}）。
    先月以前に取った分が含まれるため、数が違います。</div>`;
  h += `<p class="mini" style="margin-top:8px">
    <b>取得率</b>＝ その月に初めてご来店されたお客様のうち、次回予約を取れた方の割合です。<br>
    数え方：ビューティーメリットの<b>次回予約タブ</b>から取れた分のうち、
    <b>初めてご来店されたお客様から、その場で取れたもの</b>だけを数えています
    （電話予約枠と、枠止めの手打ちは含みません）。</p>`;
  return h;
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
    <div style="margin-top:14px">${chart('net', true, '円')}</div>
    <p class="mini" style="margin-top:6px">棒をタップすると、その月に切り替わります。</p></div>`;
  h += `<div class="strip">
    <div><div class="k">総売上（割引前）</div><div class="v">${yen(s.gross)}</div><div class="d">${delta(s.gross, pv?.gross) || '円'}</div></div>
    <div><div class="k">純売上</div><div class="v">${yen(s.net)}</div><div class="d">割引 ${yen(s.gross - s.net)}円を差引</div></div>
    <div><div class="k">客単価</div><div class="v">${yen(s.avg)}</div><div class="d">${delta(s.avg, pv?.avg) || '円'}</div></div>
    <div><div class="k">店販売上</div><div class="v">${yen(s.goods)}</div><div class="d">${delta(s.goods, pv?.goods) || '円'}</div></div>
    <div><div class="k">客数</div><div class="v">${yen(s.customers)}</div><div class="d">${delta(s.customers, pv?.customers) || '人'}</div></div>
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

  h += `<section><h2>日ごとの売上</h2>
    <p class="lede">「一覧」を押すと、日にちごとの表になります。</p>
    <div class="panel">${dailyBlock(s.daily, 'ds')}</div></section>`;

  h += `<section><h2>売上の内訳</h2>
    <p class="lede">足し引きすると純売上になります。「細かく」を押すと、中身まで見られます。</p>
    <div class="switch">
      <button type="button" class="dtab" data-t="bs" data-v="chart" aria-selected="true">ざっくり</button>
      <button type="button" class="dtab" data-t="bs" data-v="list" aria-selected="false">細かく</button>
    </div>
    <div id="bs-chart">${breakdown(s)}</div>
    <div id="bs-list" hidden><div class="panel">${breakdownDetail(s, 'bs')}</div></div>
    </section>`;

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
    ['総売上', x => yen(x.gross) + '円'],
    ['純売上', x => yen(x.net) + '円'],
    ['出勤', x => x.workdays + '日'],
    ['客数', x => x.customers],
    ['1日あたり売上', x => yen(x.net_per_day) + '円', x => x.net_per_day >= s.net_per_day ? 1 : 0],
    ['1日あたり客数', x => x.cust_per_day.toFixed(1) + '人'],
    ['客単価', x => yen(x.avg) + '円', x => x.avg >= s.avg ? 1 : 0],
    ['新規率', x => pct(x.new_rate)],
    ['指名率', x => pct(x.nom_rate)],
    ['フリー予約', x => `${x.free_count}件 ${pct(x.free_rate)}`],
    ['次回予約 取得率', x => x.rebook_made && x.rebook_made.take_rate !== null ? pct(x.rebook_made.take_rate) : '—',
      x => !x.rebook_made || x.rebook_made.take_rate === null ? 0
           : (x.rebook_made.take_rate >= T.rebook_rate ? 1 : (x.rebook_made.take_rate < 1 ? -1 : 0))],
    ['次回予約を取った', x => x.rebook_made ? `${x.rebook_made.made}件` : '—'],
    ['うち来店', x => x.rebook_made && x.rebook_made.made ? `${x.rebook_made.done}件` : '—'],
    ['次回予約で来店', x => `${x.rebook}件 ${pct(x.rebook_rate)}`, x => x.rebook_rate >= T.rebook_rate ? 1 : (x.rebook_rate <= .5 ? -1 : 0)],
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
    「出勤」は${s.workday_source === 'shift'
      ? '<b>予約枠を開けている日</b>を数えています（枠を閉じている日は休み）'
      : '<b>お会計が1件でもあった日</b>を数えています。この月はシフトの記録が無いため、この数え方です'}。<br>
    「店舗全体」の行には、フリー枠など一覧に出ていないスタッフの分も含まれます。</p>
    <div class="tbl"><table><thead><tr><th>スタイリスト</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>`;
  d.stylists.forEach(x => {
    h += `<tr><td>${esc(x.name)}</td>` + cols.map(c => {
      const j = c[2] ? c[2](x) : 0;
      return `<td class="${j > 0 ? 'ok' : j < 0 ? 'bad' : ''}">${c[1](x)}</td>`;
    }).join('') + `</tr>`;
  });
  h += `<tr class="total"><td>店舗全体</td><td>${yen(s.gross)}円</td><td>${yen(s.net)}円</td>
    <td>${s.workdays}日</td><td>${s.customers}</td><td>${yen(s.net_per_day)}円</td>
    <td>${s.cust_per_day.toFixed(1)}人</td><td>${yen(s.avg)}円</td><td>${pct(s.new_rate)}</td><td>${pct(s.nom_rate)}</td>
    <td>${s.free_count}件 ${pct(s.free_rate)}</td>
    <td>${s.rebook_made && s.rebook_made.take_rate !== null ? pct(s.rebook_made.take_rate) : '—'}</td>
    <td>${s.rebook_made ? s.rebook_made.made + '件' : '—'}</td>
    <td>${s.rebook_made ? s.rebook_made.done + '件' : '—'}</td>
    <td>${s.rebook}件 ${pct(s.rebook_rate)}</td><td>${pct(s.treat_rate)}</td>
    <td>${s.return ? pct(s.return.rate) : '—'}</td><td>${yen(s.goods)}円</td>
    <td>${pct(s.goods_buy_rate)}</td><td>${yen(s.goods_per_buyer)}円</td>
    <td>${yen(s.goods_per)}円</td></tr></tbody></table></div></section>`;

  return h;
}

function renderRebook() {
  const d = cur(), s = d.store, f = s.rebook_made;
  let h = partial();
  h += `<section><h2>次回予約（店舗全体）</h2>
    <p class="lede">初めてご来店されたお客様から、その場で取れた次回予約を追いかけています。</p>
    ${rebookBlock(s, s)}</section>`;

  const sr = f;
  const rank = [...d.stylists]
    .map(x => ({n: x.name, f: x.rebook_made}))
    .filter(r => r.f && r.f.first_visits)
    .sort((a, b) => (b.f.take_rate ?? -1) - (a.f.take_rate ?? -1));
  const maxR = Math.max(T.rebook_rate, ...rank.map(r => r.f.take_rate || 0), 1);
  h += `<section><h2>次回予約 取得率ランキング</h2>
    <p class="lede">初めてご来店されたお客様のうち、その場で次回予約を取れた割合です。目標は${T.rebook_rate}%。
    ${sr && sr.take_rate !== null ? `店舗全体は ${pct(sr.take_rate)}（初回来店 ${sr.first_visits}人中 ${sr.made}件）。` : ''}</p>
    <div class="panel routes">` +
    (rank.length ? rank.map((r, i) =>
      `<div class="r"><b>${i + 1}. ${esc(r.n)}</b>
       <div class="bar"><i style="width:${Math.min(100, (r.f.take_rate || 0) / maxR * 100).toFixed(1)}%;
         background:var(--${(r.f.take_rate || 0) >= T.rebook_rate ? 'good' : (r.f.take_rate || 0) >= T.rebook_rate / 2 ? 'accent' : 'warn'})"></i></div>
       <span class="num">${r.f.take_rate !== null ? pct(r.f.take_rate) : '—'}　${r.f.made}件／${r.f.first_visits}人</span></div>`).join('')
     : '<p class="mini">この月のデータがありません。</p>') + `</div></section>`;

  h += `<section><h2>スタイリスト別</h2>
    <p class="lede">${month.slice(0,4)}年${Number(month.slice(5))}月に取った分の内訳です。</p>
    <div class="tbl"><table><thead><tr><th>スタイリスト</th><th>取得率</th><th>取った</th>
    <th>初回来店</th><th>来店</th><th>キャンセル</th><th>来店待ち</th></tr></thead><tbody>` +
    [...d.stylists].map(x => x.rebook_made).map((r, i) => {
      const x = d.stylists[i];
      if (!r) return '';
      const hit = r.take_rate !== null && r.take_rate >= T.rebook_rate;
      return `<tr><td>${esc(x.name)}</td>
        <td class="${hit ? 'ok' : (r.take_rate !== null && r.take_rate < 1 ? 'bad' : '')}">${r.take_rate !== null ? pct(r.take_rate) : '—'}</td>
        <td>${r.made}件</td><td>${r.first_visits}人</td><td>${r.done}件</td>
        <td>${r.cancelled}件</td><td>${r.upcoming}件</td></tr>`;
    }).join('') +
    `<tr class="total"><td>店舗全体</td>
      <td>${f && f.take_rate !== null ? pct(f.take_rate) : '—'}</td><td>${f ? f.made : 0}件</td>
      <td>${f ? f.first_visits : 0}人</td><td>${f ? f.done : 0}件</td>
      <td>${f ? f.cancelled : 0}件</td><td>${f ? f.upcoming : 0}件</td></tr>
    </tbody></table></div></section>`;

  h += `<section><h2>月ごとの移り変わり</h2>
    <p class="lede">取った月で並べています。「来店待ち」がある月は、来店率がまだ確定していません。</p>
    <div class="tbl"><table><thead><tr><th>取った月</th><th>取得率</th><th>取った</th>
    <th>初回来店</th><th>来店</th><th>キャンセル</th><th>来店待ち</th><th>来店率</th></tr></thead><tbody>` +
    P.months.map(m => {
      const r = P.data[m].store.rebook_made;
      if (!r) return '';
      const cls = m === month ? ' class="total"' : '';
      return `<tr${cls}><td>${Number(m.slice(5))}月${P.data[m].partial ? '（途中）' : ''}</td>
        <td>${r.take_rate !== null ? pct(r.take_rate) : '—'}</td><td>${r.made}件</td>
        <td>${r.first_visits}人</td><td>${r.done}件</td><td>${r.cancelled}件</td>
        <td>${r.upcoming}件</td>
        <td>${r.show_rate !== null ? pct(r.show_rate) : '—'}</td></tr>`;
    }).join('') + `</tbody></table></div></section>`;
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
    <div style="margin-top:14px">${chart('net', false, '円')}</div>
    <p class="mini" style="margin-top:6px">棒をタップすると、その月に切り替わります。</p></div>`;
  h += `<div class="strip">
    <div><div class="k">総売上（割引前）</div><div class="v">${yen(x.gross)}</div><div class="d">${delta(x.gross, pv?.gross) || '円'}</div></div>
    <div><div class="k">純売上</div><div class="v">${yen(x.net)}</div><div class="d">割引 ${yen(x.gross - x.net)}円を差引</div></div>
    <div><div class="k">客単価</div><div class="v">${yen(x.avg)}</div><div class="d">店舗 ${yen(s.avg)}円</div></div>
    <div><div class="k">店販売上</div><div class="v">${yen(x.goods)}</div><div class="d">${x.goods_buyers}人が購入・平均${yen(x.goods_per_buyer)}円</div></div>
    <div><div class="k">客数</div><div class="v">${yen(x.customers)}</div><div class="d">${delta(x.customers, pv?.customers) || '人'}</div></div>
    <div><div class="k">新規率／指名率</div><div class="v">${pct(x.new_rate)}／${pct(x.nom_rate)}</div><div class="d">店舗 新規 ${pct(s.new_rate)}</div></div>
  </div>`;
  h += `<section><h2>次回予約</h2>
    <p class="lede">初回来店のお客様から取れた次回予約を、取った月ごとに追いかけています。</p>
    ${rebookBlock(x, s)}</section>`;

  h += `<section><h2>日ごとの売上</h2>
    <p class="lede">「一覧」を押すと、日にちごとの表になります。</p>
    <div class="panel">${dailyBlock(x.daily, 'dp')}</div></section>`;

  h += `<section><h2>売上の内訳</h2>
    <p class="lede">「細かく」を押すと、中身まで見られます。</p>
    <div class="switch">
      <button type="button" class="dtab" data-t="bp" data-v="chart" aria-selected="true">ざっくり</button>
      <button type="button" class="dtab" data-t="bp" data-v="list" aria-selected="false">細かく</button>
    </div>
    <div id="bp-chart">${breakdown(x)}</div>
    <div id="bp-list" hidden><div class="panel">${breakdownDetail(x, 'bp')}</div></div>
    </section>`;

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
    view === 'store' ? renderStore() : view === 'rank' ? renderRank()
    : view === 'rebook' ? renderRebook() : renderPerson();
  window.scrollTo({top: 0, behavior: 'instant'});
}

document.getElementById('view').addEventListener('click', ev => {
  const tab = ev.target.closest('.dtab');
  if (tab) {
    const id = tab.dataset.t, v = tab.dataset.v;
    document.querySelectorAll(`.dtab[data-t="${id}"]`).forEach(b =>
      b.setAttribute('aria-selected', String(b === tab)));
    document.getElementById(id + '-chart').hidden = v !== 'chart';
    document.getElementById(id + '-list').hidden = v !== 'list';
    return;
  }
  const t = ev.target.closest('.mbar');
  if (!t) return;
  const m = t.getAttribute('data-m');
  if (m && P.data[m] && m !== month) { month = m; selM.value = m; render(); }
});

document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.seg button').forEach(t => t.setAttribute('aria-selected', String(t === b)));
  view = b.dataset.v; render();
}));
selM.addEventListener('change', e => { month = e.target.value; render(); });
selS.addEventListener('change', e => { person = e.target.value; render(); });
render();
</script>

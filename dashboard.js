<script>
const P = JSON.parse(document.getElementById('payload').textContent);
const T = P.target;
const yen = n => Math.round(n).toLocaleString('ja-JP');
const pct = n => n.toFixed(1) + '%';
const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
let view = 'store';
let month = P.months[P.months.length - 1];   // 既定は当月
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

const DAILY = {};

/* 日別：グラフと一覧を切り替えられる形で返す */
function dailyBlock(rows, id) {
  if (!rows || !rows.length) return '<p class="mini">この月のデータがありません。</p>';
  DAILY[id] = rows;
  let sel = 0;
  rows.forEach((r, i) => { if (r[2] > rows[sel][2]) sel = i; });   // 最初はいちばん売れた日
  return `<div class="switch">
      <button type="button" class="dtab" data-t="${id}" data-v="chart" aria-selected="true">グラフ</button>
      <button type="button" class="dtab" data-t="${id}" data-v="list" aria-selected="false">一覧</button>
    </div>
    <div id="${id}-chart">${daily(rows, id, sel)}</div>
    <div id="${id}-list" hidden>${dailyTable(rows)}</div>`;
}

/* タップした日の数字を見やすく出す */
function dayInfo(rows, id, sel) {
  const r = rows[sel];
  if (!r) return '';
  const [d, gr, v, c, g] = r;
  const y = Number(month.slice(0, 4)), mo = Number(month.slice(5));
  const w = new Date(y, mo - 1, d).getDay();
  const head = `<div class="dhead">${mo}月${d}日<span class="wd ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}">（${WD[w]}）</span></div>`;
  if (v === 0 && gr === 0) {
    return `<div class="dayinfo">${head}
      <div class="mini" style="margin-top:5px">この日はお会計がありません。</div></div>`;
  }
  return `<div class="dayinfo">${head}<div class="dgrid">
      <div><span>総売上</span><b>${yen(gr)}円</b></div>
      <div><span>純売上</span><b>${yen(v)}円</b></div>
      <div><span>客数</span><b>${c}人</b></div>
      <div><span>客単価</span><b>${c ? yen(v / c) : 0}円</b></div>
      <div><span>店販</span><b>${yen(g)}円</b></div>
    </div></div>`;
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
function daily(rows, id, sel) {
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
    const on = i === sel;
    bars += `<rect class="dbar" data-t="${id}" data-i="${i}" x="${(x - gap / 2).toFixed(2)}" y="-4"
      width="${(bw + gap).toFixed(2)}" height="${H + 4}" fill="transparent"></rect>`;
    bars += `<rect class="dbar" data-t="${id}" data-i="${i}" x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}"
      width="${bw.toFixed(2)}" height="${h.toFixed(2)}" rx=".5"
      fill="var(--${v === 0 ? 'line2' : on ? 'accent' : 'line'})"
      ><title>${d}日　純売上 ${yen(v)}円　${c}人</title></rect>`;
    if (d === 1 || d % 5 === 0 || i === n - 1) {
      labs += `<text class="dbar" data-t="${id}" data-i="${i}" x="${(x + bw / 2).toFixed(2)}"
        y="${H + 4}" text-anchor="middle" font-size="2.9"
        fill="var(--${on ? 'ink2' : 'ink3'})" font-weight="${on ? 700 : 400}">${d}</text>`;
    }
  });
  const sum = rows.reduce((a, b) => a + b[2], 0);
  const open = rows.filter(r => r[2] > 0).length;
  return `<svg class="chart" viewBox="-1 -2 ${W + 2} ${H + 8}" role="img"
    aria-label="日ごとの売上"><line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--line)"
    stroke-width=".25"></line>${bars}${labs}</svg>
    ${dayInfo(rows, id, sel)}
    <p class="mini" style="margin-top:8px">棒をタップすると、その日の数字が出ます。棒の高さは純売上です。<br>
    営業 ${open}日／1日平均 ${yen(sum / Math.max(open, 1))}円　
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
  const tg = d.target;
  const rate = tg && tg.store ? s.gross / tg.store * 100 : null;
  const rest = tg && tg.store ? Math.max(0, tg.store - s.gross) : 0;
  h += `<div class="hero"><div class="lab">総売上</div>
    <div class="big">${yen(s.gross)}<span style="font-size:.5em;font-weight:600"> 円</span></div>
    <div class="sub">純売上 ${yen(s.net)}円　${delta(s.gross, pv?.gross) || ''}　稼働 ${s.headcount}名</div>
    ${tg && tg.store ? `<div class="goalline ${rate >= 100 ? 'hit' : 'miss'}">
      <span>月間目標 <span class="amt">${yen(tg.store)}円</span></span><b>${pct(rate)}</b>
      <span>${rest > 0 ? 'あと ' + yen(rest) + '円' : '達成しました'}</span></div>
      <div class="track" style="margin-top:8px;height:7px">
        <i class="${rate >= 100 ? 'ok' : 'bad'}" style="width:${Math.min(100, rate).toFixed(1)}%"></i></div>` : ''}
    <div style="margin-top:14px">${chart('gross', true, '円')}</div>
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
  h += `<section><h2 class="c-blue">目標に対して、いま どこにいるか</h2>
    <p class="lede">今回の施策で動かしたい4つの数字です。</p><div class="panel goal">
    ${goal('次回予約率', s.rebook_rate, T.rebook_rate, pct)}
    ${r ? goal(`リターン率（新規${r.judged}人中 ${r.returned}人が${r.days}日以内に再来）`, r.rate, T.return_rate, pct)
        : `<div class="g"><span class="n">リターン率</span><span class="val">—</span>
           <span class="tgt">この月の新規のお客様は、まだ判定できる日数（${75}日）が経っていません</span></div>`}
    ${goal('トリートメント装着率', s.treat_rate, T.treat_rate, pct)}
    ${goal('店販（お客様1人あたり・全員平均）', s.goods_per, T.goods_per, v => yen(v) + '円')}
    </div></section>`;

  h += `<section><h2 class="c-green">店販</h2>
    <p class="lede">お会計 ${yen(s.customers)}件のうち、${s.goods_buyers}件で店販が売れました。</p>
    <div class="strip" style="margin-top:0">
      <div><div class="k">店販売上</div><div class="v">${yen(s.goods)}</div><div class="d">${delta(s.goods, pv?.goods) || '円'}</div></div>
      <div><div class="k">買ったお客様</div><div class="v">${s.goods_buyers}<span style="font-size:.62em">人</span></div><div class="d">お客様の ${pct(s.goods_buy_rate)}</div></div>
      <div><div class="k">買った方の平均</div><div class="v">${yen(s.goods_per_buyer)}</div><div class="d">円（${s.goods_items}点・1点 ${yen(s.goods_per_item)}円）</div></div>
    </div>
    <div class="note" style="margin-top:12px">お客様1人あたり <b>${yen(s.goods_per)}円</b> は、
      買っていない方も含めた ${yen(s.customers)}人全員で割った数字です。
      実際に買ってくださった方は、平均 <b>${yen(s.goods_per_buyer)}円</b> 使っています。</div>`;
  h += `</section>`;

  h += `<section><h2 class="c-teal">日ごとの売上</h2>
    <p class="lede">「一覧」を押すと、日にちごとの表になります。</p>
    <div class="panel">${dailyBlock(s.daily, 'ds')}</div></section>`;

  const breakHtml = `<p class="lede" style="padding-left:0">足し引きすると純売上になります。「細かく」を押すと、中身まで見られます。</p>
    <div class="switch">
      <button type="button" class="dtab" data-t="bs" data-v="chart" aria-selected="true">ざっくり</button>
      <button type="button" class="dtab" data-t="bs" data-v="list" aria-selected="false">細かく</button>
    </div>
    <div id="bs-chart">${breakdown(s)}</div>
    <div id="bs-list" hidden><div class="panel">${breakdownDetail(s, 'bs')}</div></div>`;

  const rs = Object.entries(s.routes || {}).sort((a, b) => b[1] - a[1]);
  const tot = rs.reduce((a, b) => a + b[1], 0) || 1;
  const routeHtml = `<div class="panel routes">` +
    rs.map(([k, v], i2) => `<div class="r"><b>${esc(k)}</b>
      <div class="bar"><i style="width:${(v / tot * 100).toFixed(1)}%;background:var(--${
        k === '次回予約' ? 'green' : k === 'アプリ' ? 'blue' : k === 'ホットペッパービューティー' ? 'orange' : 'purple'})"></i></div>
      <span class="num">${v}件 ${(v / tot * 100).toFixed(1)}%</span></div>`).join('') + `</div>`;

  const f = d.store_feedback;
  h += `<section><h2 class="c-purple">この月のフィードバック</h2>
    <p class="lede">目標との差から自動で書き出しています。</p><div class="panel">`;
  if (f.good.length) h += `<h3>できていること</h3>` + notes(f.good, 'g');
  if (f.issues.length) h += `<h3>伸びしろ</h3>` + notes(f.issues, 'r');
  if (f.actions.length) h += `<h3>次の一手</h3>` + notes(f.actions, 'y');
  h += `</div></section>`;

  const menuHtml = d.top_menus?.length ? `<div class="tbl"><table><thead><tr>
      <th>メニュー</th><th>件数</th><th>売上</th></tr></thead><tbody>` +
      d.top_menus.map(([k, c0, v]) => `<tr><td>${esc(k)}</td><td>${c0}</td><td>${yen(v)}円</td></tr>`).join('') +
      `</tbody></table></div>` : '';
  const ps = Object.entries(s.payments || {}).sort((a, b) => b[1] - a[1]);
  const pt = ps.reduce((a, b) => a + b[1], 0) || 1;
  const payHtml = ps.length ? `<div class="panel routes">` +
      ps.map(([k, v], i2) => `<div class="r"><b>${esc(k)}</b>
        <div class="bar"><i style="width:${(v / pt * 100).toFixed(1)}%;
          background:var(--${SERIES_COLORS[i2 % SERIES_COLORS.length]})"></i></div>
        <span class="num">${v}件 ${(v / pt * 100).toFixed(1)}%</span></div>`).join('') + `</div>` : '';
  const goodsHtml = d.top_goods?.length ? `<div class="tbl"><table><thead><tr>
      <th>商品</th><th>点数</th><th>売上</th></tr></thead><tbody>` +
      d.top_goods.map(([k, c0, v]) => `<tr><td>${esc(k)}</td><td>${c0}</td><td>${yen(v)}円</td></tr>`).join('') +
      `</tbody></table></div>` : '';

  h += subBlock('store', [
    ['break', breakHtml, '売上の内訳', 'orange'],
    ['route', routeHtml, '予約経路', 'blue'],
    ['menu', menuHtml, 'よく出たメニュー', 'yellow'],
    ['goods', goodsHtml, '売れた商品', 'green'],
    ['pay', payHtml, '支払い方法', 'purple'],
  ]);
  return h;
}

/* ---- 小タブ（優先度の低い項目をまとめる） ---- */
let subTab = {};
function subBlock(id, items) {
  const use = items.filter(i => i && i[1]);
  if (!use.length) return '';
  if (!subTab[id] || !use.some(i => i[0] === subTab[id])) subTab[id] = use[0][0];
  const cur = subTab[id];
  return `<section><h2 class="c-ink">くわしく見る</h2>
    <p class="lede">ふだんは見なくてよい項目をまとめています。</p>
    <div class="switch wrap">` +
    use.map(([k, , label, col]) => `<button type="button" class="stab" data-s="${id}" data-k="${k}"
      aria-selected="${k === cur}"><i class="dot" style="background:var(--${col || 'accent'})"></i>${label}</button>`).join('') +
    `</div>` + (use.find(i => i[0] === cur)[1]) + `</section>`;
}

/* ---- 成長の折れ線グラフ（スタイリスト比較） ---- */
const SERIES_COLORS = ['blue', 'orange', 'green', 'purple', 'red', 'yellow', 'teal', 'pink'];
const TREND_RANGES = [[3, '3ヶ月'], [6, '半年'], [9, '9ヶ月'], [12, '1年'], [0, '全期間']];
const TREND_METRICS = [['gross', '総売上', v => yen(v) + '円'],
                       ['net', '純売上', v => yen(v) + '円'],
                       ['customers', '客数', v => v + '人'],
                       ['avg', '客単価', v => yen(v) + '円']];
let trendRange = 6, trendKey = 'gross', trendWho = 'store', trendSel = null;

function stylistColors() {
  const H = P.history || {stylists: {}};
  const names = Object.keys(H.stylists).sort();
  const map = {};
  names.forEach((n, i) => { map[n] = SERIES_COLORS[i % SERIES_COLORS.length]; });
  return map;
}

function colorKey(map, only) {
  const names = only ? [only] : Object.keys(map);
  return `<div class="ckey">` + names.map(n =>
    `<span><i style="background:var(--${map[n]})"></i>${esc(n)}</span>`).join('') + `</div>`;
}

function trendChart() {
  const H = P.history;
  if (!H || !H.months || H.months.length < 2) return '<p class="mini">推移を出せるデータがありません。</p>';
  const all = H.months;
  const ms = trendRange ? all.slice(-trendRange) : all;
  const spec = TREND_METRICS.find(t => t[0] === trendKey) || TREND_METRICS[0];
  const cmap = stylistColors();
  const active = Object.keys(H.stylists).filter(n =>
    ms.some(m => H.stylists[n][m] && H.stylists[n][m].gross > 0));
  if (trendWho !== 'store' && trendWho !== 'all' && !active.includes(trendWho)) {
    trendWho = active.length ? 'all' : 'store';
  }

  const series = [];
  if (trendWho === 'store') {
    series.push({name: '店舗全体', color: 'blue', wide: true,
                 vals: ms.map(m => (H.store[m] ? H.store[m][trendKey] : null))});
  } else if (trendWho === 'all') {
    series.push({name: '全員の平均', color: 'ink3', dash: true, wide: true,
      vals: ms.map(m => {
        const vs = active.map(n => (H.stylists[n][m] ? H.stylists[n][m][trendKey] : null))
                         .filter(v => v !== null && v > 0);
        return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      })});
    active.forEach(n => series.push({name: n, color: cmap[n],
      vals: ms.map(m => (H.stylists[n][m] ? H.stylists[n][m][trendKey] : null))}));
  } else {
    const n = trendWho;
    series.push({name: '全員の平均', color: 'ink3', dash: true,
      vals: ms.map(m => {
        const vs = active.map(k => (H.stylists[k][m] ? H.stylists[k][m][trendKey] : null))
                         .filter(v => v !== null && v > 0);
        return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      })});
    series.push({name: n, color: cmap[n], wide: true,
      vals: ms.map(m => (H.stylists[n][m] ? H.stylists[n][m][trendKey] : null))});
  }

  const flat = series.flatMap(sr => sr.vals).filter(v => v !== null && v > 0);
  if (!flat.length) return '<p class="mini">この期間のデータがありません。</p>';
  const max = Math.max(...flat);
  const W = 100, Hh = 42, n = ms.length;
  const xf = i2 => (n === 1 ? W / 2 : i2 * (W / (n - 1)));
  const yf = v => Hh - v / (max || 1) * Hh;
  let sel = trendSel;
  if (sel === null || sel >= n) sel = n - 1;

  let grid = '', lines = '', dots = '', labs = '';
  for (let g = 0; g <= 3; g++) {
    const y = Hh * g / 3;
    grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="var(--line2)" stroke-width=".2"></line>`;
  }
  grid += `<line x1="${xf(sel)}" y1="-3" x2="${xf(sel)}" y2="${Hh}" stroke="var(--accent)"
    stroke-width=".35" stroke-dasharray="1.5 1.2"></line>`;
  const seg = (run, sr) => `<polyline points="${run.join(' ')}" fill="none" stroke="var(--${sr.color})"
      stroke-width="${sr.wide ? 1.2 : .8}" stroke-linejoin="round" stroke-linecap="round"
      ${sr.dash ? 'stroke-dasharray="2.5 1.5"' : ''}></polyline>`;
  series.forEach(sr => {
    let run = [];
    sr.vals.forEach((v, i2) => {
      if (v === null || v === 0) { if (run.length > 1) lines += seg(run, sr); run = []; return; }
      run.push(`${xf(i2).toFixed(2)},${yf(v).toFixed(2)}`);
      dots += `<circle cx="${xf(i2).toFixed(2)}" cy="${yf(v).toFixed(2)}" r="${i2 === sel ? 1.5 : .8}"
        fill="var(--${sr.color})" stroke="var(--surface)" stroke-width=".3"></circle>`;
    });
    if (run.length > 1) lines += seg(run, sr);
  });
  ms.forEach((m, i2) => {
    const show = n <= 8 || i2 % Math.ceil(n / 8) === 0 || i2 === n - 1;
    if (show) labs += `<text x="${xf(i2).toFixed(2)}" y="${Hh + 5}" text-anchor="middle"
      font-size="3" fill="var(--${i2 === sel ? 'ink2' : 'ink3'})"
      font-weight="${i2 === sel ? 700 : 400}">${Number(m.slice(5))}月</text>`;
    lines += `<rect class="tbar" data-i="${i2}" x="${(xf(i2) - W / n / 2).toFixed(2)}" y="-4"
      width="${(W / n).toFixed(2)}" height="${Hh + 5}" fill="transparent"></rect>`;
  });

  const rows = series.map(sr => ({name: sr.name, color: sr.color, v: sr.vals[sel]}))
    .filter(r => r.v !== null && r.v > 0).sort((a, b) => b.v - a.v);

  let who = `<div class="row2"><span class="rowlab">誰を</span><div class="switch wrap">
      <button type="button" class="twho" data-w="store" aria-selected="${trendWho === 'store'}">店舗全体</button>
      <button type="button" class="twho" data-w="all" aria-selected="${trendWho === 'all'}">全員＋平均</button>
      <button type="button" class="twho" data-w="one"
        aria-selected="${trendWho !== 'store' && trendWho !== 'all'}">1人ずつ</button>
    </div></div>`;
  if (trendWho !== 'store' && trendWho !== 'all') {
    who += `<div class="row2"><span class="rowlab">スタイリスト</span><div class="switch wrap">` + active.map(nm =>
      `<button type="button" class="twho" data-w="${esc(nm)}" aria-selected="${nm === trendWho}">
        <i class="dot" style="background:var(--${cmap[nm]})"></i>${esc(nm)}</button>`).join('') + `</div></div>`;
  }

  return who + `<div class="row2"><span class="rowlab">期間</span><div class="switch wrap">` +
      TREND_RANGES.map(([r, l]) => `<button type="button" class="trange" data-r="${r}"
        aria-selected="${r === trendRange}">${l}</button>`).join('') + `</div></div>
    <div class="row2"><span class="rowlab">見る数字</span><div class="switch wrap">` +
      TREND_METRICS.map(([k, l]) => `<button type="button" class="tmetric" data-k="${k}"
        aria-selected="${k === trendKey}">${l}</button>`).join('') + `</div></div>
    ${trendWho === 'all' ? colorKey(cmap) : ''}
    <svg class="chart trend" viewBox="-2 -6 ${W + 4} ${Hh + 13}" role="img" aria-label="成長の推移">
      ${grid}${lines}${dots}${labs}</svg>
    <div class="dayinfo"><div class="dhead">${ms[sel].slice(0, 4)}年${Number(ms[sel].slice(5))}月の${spec[1]}</div>
      <div class="legend">` +
      rows.map(r => `<div><i style="background:var(--${r.color})"></i>
        <span>${esc(r.name)}</span><b>${spec[2](r.v)}</b></div>`).join('') +
      `</div></div>
    <p class="mini" style="margin-top:8px">グラフのあたりをタップすると、その月の数字が出ます。
    点線は平均です。</p>`;
}


function renderRebook() {
  const d = cur(), s = d.store, f = s.rebook_made;
  let h = partial();
  h += `<section><h2 class="c-green">次回予約（店舗全体）</h2>
    <p class="lede">初めてご来店されたお客様から、その場で取れた次回予約を追いかけています。</p>
    ${rebookBlock(s, s)}</section>`;

  const sr = f;
  const rank = [...d.stylists]
    .map(x => ({n: x.name, f: x.rebook_made}))
    .filter(r => r.f && r.f.first_visits)
    .sort((a, b) => (b.f.take_rate ?? -1) - (a.f.take_rate ?? -1));
  const maxR = Math.max(T.rebook_rate, ...rank.map(r => r.f.take_rate || 0), 1);
  h += `<section><h2 class="c-purple">次回予約 取得率ランキング</h2>
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
  h += `<section><h2 class="c-teal">成長の推移</h2>
    <p class="lede">見たい相手・期間・項目を選べます。</p>
    <div class="panel">${trendChart()}</div></section>`;
  h += `<section><h2 class="c-blue">スタイリスト比較</h2>
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

/* ---- 売上の予測 ---- */
const FC_RANGES = [[3, '3ヶ月'], [6, '半年'], [9, '9ヶ月'], [12, '1年']];
const FC_SCEN = [['high', '上昇', 'green'], ['mid', '順当', 'blue'], ['low', '悲観的', 'red']];
let fcRange = 6, fcKey = 'gross', fcWho = 'store', fcSel = null;

function forecastChart() {
  const F = P.forecast;
  if (!F) return '<p class="mini">予測を出せるデータがありません。</p>';
  const ms = F.months.slice(0, fcRange);
  const names = Object.keys(F.scenarios.mid[ms[0]].stylists);
  if (fcWho !== 'store' && !names.includes(fcWho)) fcWho = 'store';
  const nr = fcKey === 'net' ? (F.net_ratio[fcWho] ?? 1) : 1;
  const pick = (sc, m) => {
    const e = F.scenarios[sc][m];
    return (fcWho === 'store' ? e.store : (e.stylists[fcWho] || 0)) * nr;
  };
  const all = FC_SCEN.flatMap(([k]) => ms.map(m => pick(k, m)));
  const max = Math.max(...all, 1);
  const W = 100, H = 40, n = ms.length;
  const xf = i => (n === 1 ? W / 2 : i * (W / (n - 1)));
  const yf = v => H - v / max * H;
  let sel = fcSel; if (sel === null || sel >= n) sel = 0;

  let g = '', lines = '', dots = '', labs = '';
  for (let k = 0; k <= 3; k++) {
    const y = H * k / 3;
    g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="var(--line2)" stroke-width=".2"></line>`;
  }
  g += `<line x1="${xf(sel)}" y1="-3" x2="${xf(sel)}" y2="${H}" stroke="var(--accent)"
    stroke-width=".35" stroke-dasharray="1.5 1.2"></line>`;
  FC_SCEN.forEach(([k, , col]) => {
    const pts = ms.map((m, i) => `${xf(i).toFixed(2)},${yf(pick(k, m)).toFixed(2)}`);
    lines += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--${col})"
      stroke-width="${k === 'mid' ? 1.2 : .8}" stroke-linejoin="round"
      ${k === 'mid' ? '' : 'stroke-dasharray="2.4 1.6"'}></polyline>`;
    ms.forEach((m, i) => {
      dots += `<circle cx="${xf(i).toFixed(2)}" cy="${yf(pick(k, m)).toFixed(2)}"
        r="${i === sel ? 1.5 : .7}" fill="var(--${col})" stroke="var(--surface)" stroke-width=".3"></circle>`;
    });
  });
  ms.forEach((m, i) => {
    const show = n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1;
    if (show) labs += `<text x="${xf(i).toFixed(2)}" y="${H + 5}" text-anchor="middle" font-size="3"
      fill="var(--${i === sel ? 'ink2' : 'ink3'})" font-weight="${i === sel ? 700 : 400}">${Number(m.slice(5))}月</text>`;
    lines += `<rect class="fbar" data-i="${i}" x="${(xf(i) - W / n / 2).toFixed(2)}" y="-4"
      width="${(W / n).toFixed(2)}" height="${H + 5}" fill="transparent"></rect>`;
  });

  const cmap = stylistColors();
  const label = fcWho === 'store' ? '店舗全体' : fcWho;
  return `<div class="row2"><span class="rowlab">誰を</span><div class="switch wrap">
      <button type="button" class="fwho" data-w="store" aria-selected="${fcWho === 'store'}">店舗全体</button>` +
      names.map(nm => `<button type="button" class="fwho" data-w="${esc(nm)}" aria-selected="${nm === fcWho}">
        <i class="dot" style="background:var(--${cmap[nm] || 'accent'})"></i>${esc(nm)}</button>`).join('') +
    `</div></div>
    <div class="row2"><span class="rowlab">期間</span><div class="switch wrap">` +
      FC_RANGES.map(([r, l]) => `<button type="button" class="frange" data-r="${r}"
        aria-selected="${r === fcRange}">${l}</button>`).join('') + `</div></div>
    <div class="row2"><span class="rowlab">見る数字</span><div class="switch wrap">
      <button type="button" class="fmetric" data-k="gross" aria-selected="${fcKey === 'gross'}">総売上</button>
      <button type="button" class="fmetric" data-k="net" aria-selected="${fcKey === 'net'}">純売上</button>
    </div></div>
    <div class="ckey">` + FC_SCEN.map(([, l, c]) =>
      `<span><i style="background:var(--${c})"></i>${l}</span>`).join('') + `</div>
    <svg class="chart trend" viewBox="-2 -6 ${W + 4} ${H + 13}" role="img" aria-label="売上の予測">
      ${g}${lines}${dots}${labs}</svg>
    <div class="dayinfo"><div class="dhead">${ms[sel].slice(0, 4)}年${Number(ms[sel].slice(5))}月の予測
      <span class="wd" style="font-size:12px">${esc(label)}・${fcKey === 'net' ? '純売上' : '総売上'}</span></div>
      <div class="legend">` +
      FC_SCEN.map(([k, l, c]) => `<div><i style="background:var(--${c})"></i>
        <span>${l}</span><b>${yen(pick(k, ms[sel]))}円</b></div>`).join('') +
      `</div></div>
    <p class="mini" style="margin-top:8px">グラフのあたりをタップすると、その月の予測が出ます。
    ${F.based_on.map(m => Number(m.slice(5)) + '月').join('・')}の実績をもとに、季節と出勤日数を反映しています。</p>`;
}

function renderGoal() {
  const d = cur(), s = d.store, t = d.target;
  let h = partial();
  if (!t) {
    return h + `<section><div class="panel"><p>この月の目標は出せません。<br>
      目標は、それより前の「集計が終わった月」の実績をもとに計算しています。</p></div></section>`;
  }
  const act = s.gross;                       // 目標は総売上で見る
  const rate = t.store ? act / t.store * 100 : 0;
  const left = Math.max(0, t.store - act);
  // 当月が途中なら、経過した出勤日から見たペースを出す
  const doneDays = s.workdays, planDays = t.store_days || s.workdays;
  const pace = (planDays && doneDays) ? (act / doneDays * planDays) / t.store * 100 : null;

  h += `<div class="hero"><div class="lab">${Number(month.slice(5))}月の総売上目標（店舗）</div>
    <div class="big">${yen(t.store)}<span style="font-size:.5em;font-weight:600"> 円</span></div>
    <div class="sub">出勤のべ ${planDays}日ぶん${t.floored ? `　（ボーダー ${yen(t.floor)}円を適用）` : ''}</div>
    <div class="track" style="margin-top:14px;height:12px">
      <i class="${rate >= 100 ? 'ok' : rate >= 80 ? '' : 'bad'}" style="width:${Math.min(100, rate).toFixed(1)}%"></i></div>
    <div class="sub" style="margin-top:8px">総売上 <b>${yen(act)}円</b>　達成率 <b>${pct(rate)}</b>
      ${left > 0 ? `　あと ${yen(left)}円` : '　達成しました'}</div></div>`;

  h += `<div class="strip">
    <div><div class="k">目標（総売上）</div><div class="v">${yen(t.store)}</div><div class="d">円</div></div>
    <div><div class="k">実績（総売上）</div><div class="v">${yen(act)}</div><div class="d">${d.partial ? Number(month.slice(5)) + '月' + Number(d.end.slice(8)) + '日まで' : '確定'}</div></div>
    <div><div class="k">達成率</div><div class="v">${pct(rate)}</div><div class="d">${left > 0 ? 'あと ' + yen(left) + '円' : '達成'}</div></div>
    ${d.partial && pace !== null ? `<div><div class="k">このペースだと</div><div class="v">${pct(pace)}</div>
      <div class="d">出勤 ${doneDays}／${planDays}日で計算</div></div>` : ''}
  </div>`;

  h += `<section><h2 class="c-blue">スタイリストごとの目標</h2>
    <p class="lede">すべて総売上（割引前）です。出勤日数をかけて出しています。横にスクロールできます。</p>
    <div class="tbl"><table><thead><tr><th>スタイリスト</th><th>出勤</th>
    <th>1日あたりの基準</th><th>いちばん良かった月</th><th>目標</th><th>実績</th>
    <th>達成率</th><th>残り</th></tr></thead><tbody>` +
    Object.entries(t.stylists).sort((a, b) => b[1].target - a[1].target).map(([n, v]) => {
      const r = v.target ? v.actual / v.target * 100 : 0;
      const rest = Math.max(0, v.target - v.actual);
      return `<tr><td>${esc(n)}</td><td>${v.days}日</td><td>${yen(v.base_per_day)}円</td>
        <td>${Number(v.best_month.slice(5))}月</td>
        <td>${yen(v.target)}円</td><td>${yen(v.actual)}円</td>
        <td class="${r >= 100 ? 'ok' : r < 80 ? 'bad' : ''}">${pct(r)}</td>
        <td>${rest > 0 ? yen(rest) + '円' : '—'}</td></tr>`;
    }).join('') +
    `<tr class="total"><td>店舗全体</td><td>${planDays}日</td><td>—</td><td>—</td>
      <td>${yen(t.store)}円</td><td>${yen(act)}円</td>
      <td class="${rate >= 100 ? 'ok' : rate < 80 ? 'bad' : ''}">${pct(rate)}</td>
      <td>${left > 0 ? yen(left) + '円' : '—'}</td></tr></tbody></table></div></section>`;

  h += `<section><h2 class="c-green">達成率の推移</h2><div class="panel routes">` +
    P.months.map(m => {
      const tt = P.data[m].target, ss = P.data[m].store;
      if (!tt) return '';
      const r = tt.store ? ss.gross / tt.store * 100 : 0;
      return `<div class="r"><b>${Number(m.slice(5))}月${P.data[m].partial ? '（途中）' : ''}</b>
        <div class="bar"><i style="width:${Math.min(100, r).toFixed(1)}%;
          background:var(--${r >= 100 ? 'good' : r >= 80 ? 'accent' : 'warn'})"></i></div>
        <span class="num">${pct(r)}　${yen(ss.gross)}／${yen(tt.store)}円</span></div>`;
    }).join('') + `</div></section>`;

  const howHtml = `<div class="panel">
    <p style="margin:0 0 10px">${t.based_on.map(m => Number(m.slice(5)) + '月').join('・')}の
    <b>「1日あたり総売上」の平均</b>を基準にしています。
    そこに <b>${((t.growth - 1) * 100).toFixed(0)}%</b> を上乗せし、その月の出勤日数をかけたものが目標です。</p>
    <div class="note">1人の目標 ＝ 直近の1日あたり総売上の平均${t.growth !== 1 ? ' × ' + t.growth : ''} × その月の出勤日数<br>
      店舗の目標 ＝ 全員の合計に、フリー枠など一覧に出ていない分を過去の比率で足したもの<br>
      店舗の目標は <b>${yen(t.floor)}円</b> をボーダーとし、下回る月は全員の目標を同じ割合で引き上げます
      ${t.floored ? '（<b>今月はボーダーを適用しています</b>）' : ''}</div>
    <p class="mini" style="margin-top:10px">季節（繁忙期・閑散期）は目標には掛けていません。
    実績そのものから決めています。</p></div>`;

  const st = t.season_table || {}, sy = t.season_years || {};
  let seasonHtml = '';
  if (Object.keys(st).length) {
    const mx = Math.max(...Object.values(st));
    seasonHtml = `<p class="lede" style="padding-left:0">目標には使っていません。年間の傾向を見るための目安です。
      スタッフの人数の増減が混ざらないよう<b>1名あたりの客数</b>に直し、成長分を取り除いて計算しました。1.00が平年並みです。</p>
      <div class="panel routes">` +
      Object.keys(st).map(Number).sort((a, b) => a - b).map(m => {
        const v = st[String(m)], tag = v >= 1.08 ? '繁忙' : v <= 0.93 ? '閑散' : '';
        return `<div class="r"><b>${m}月${m === Number(month.slice(5)) ? '（今月）' : ''}</b>
          <div class="bar"><i style="width:${(v / mx * 100).toFixed(1)}%;
            background:var(--${v >= 1.08 ? 'orange' : v <= 0.93 ? 'blue' : 'line'})"></i></div>
          <span class="num">${v.toFixed(2)}　${tag}　${sy[String(m)] || 0}年分</span></div>`;
      }).join('') + `</div>
      <p class="mini" style="margin-top:10px">1〜5月と10〜12月は1年分のデータしかないため、まだ目安です。</p>`;
  }

  h += `<section><h2 class="c-teal">この先の売上予測</h2>
    <p class="lede">3つの見通しで、先の売上を見積もっています。</p>
    <div class="panel">${forecastChart()}</div></section>`;

  h += subBlock('goal', [
    ['how', howHtml, '目標の決め方', 'blue'],
    ['season', seasonHtml, '月ごとの忙しさ', 'yellow'],
  ]);
  return h;
}

const GROWTH_METRICS = [
  ['gross', '総売上', v => yen(v) + '円'],
  ['customers', '客数', v => v + '人'],
  ['avg', '客単価', v => yen(v) + '円'],
  ['goods', '店販', v => yen(v) + '円'],
  ['net_per_day', '1日あたり', v => yen(v) + '円'],
];
let growthKey = 'gross';
let growthSel = null;

/* スタイリストの成長グラフ（月ごと・タップで数字） */
function growthBlock(name) {
  const rows = P.months.map(m => {
    const x = (P.data[m].stylists || []).find(v => v.name === name);
    return {m, x, partial: P.data[m].partial};
  });
  if (!rows.some(r => r.x)) return '';
  const spec = GROWTH_METRICS.find(g => g[0] === growthKey) || GROWTH_METRICS[0];
  const vals = rows.map(r => (r.x ? (r.x[spec[0]] || 0) : 0));
  const max = Math.max(...vals, 1);
  let sel = growthSel;
  if (sel === null || sel === undefined || !rows[sel]) sel = P.months.indexOf(month);
  const W = 100, H = 30, gap = 2.2, n = rows.length;
  const bw = (W - gap * (n - 1)) / n;
  let bars = '', labs = '';
  rows.forEach((r, i) => {
    const v = vals[i], h = Math.max(v > 0 ? 1 : 0.4, v / max * (H - 8));
    const x = i * (bw + gap), on = i === sel;
    bars += `<rect class="gbar" data-i="${i}" x="${(x - gap / 2).toFixed(2)}" y="-8"
      width="${(bw + gap).toFixed(2)}" height="${H + 8}" fill="transparent"></rect>`;
    bars += `<rect class="gbar" data-i="${i}" x="${x.toFixed(2)}" y="${(H - h).toFixed(2)}"
      width="${bw.toFixed(2)}" height="${h.toFixed(2)}" rx="1"
      fill="var(--${v === 0 ? 'line2' : on ? 'accent' : 'line'})"></rect>`;
    if (on && v > 0) bars += `<text x="${(x + bw / 2).toFixed(2)}" y="${(H - h - 2.2).toFixed(2)}"
      text-anchor="middle" font-size="3.4" font-weight="700" fill="var(--accent)">${spec[2](v)}</text>`;
    labs += `<text class="gbar" data-i="${i}" x="${(x + bw / 2).toFixed(2)}" y="${H + 4.6}"
      text-anchor="middle" font-size="3.2" fill="var(--${on ? 'ink2' : 'ink3'})"
      font-weight="${on ? 700 : 400}">${Number(r.m.slice(5))}月</text>`;
  });
  // 伸び（最初の月と選んだ月の比較）
  const firstIdx = vals.findIndex(v => v > 0);
  const diff = (firstIdx >= 0 && firstIdx !== sel && vals[firstIdx])
    ? (vals[sel] - vals[firstIdx]) / vals[firstIdx] * 100 : null;
  const r = rows[sel];
  const x = r && r.x;
  return `<div class="switch">` + GROWTH_METRICS.map(([k, label]) =>
      `<button type="button" class="gtab" data-k="${k}" aria-selected="${k === growthKey}">${label}</button>`).join('') +
    `</div>
    <svg class="chart" viewBox="-1 -10 ${W + 2} ${H + 17}" role="img" aria-label="月ごとの推移">
      <line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--line)" stroke-width=".25"></line>
      ${bars}${labs}</svg>
    ${x ? `<div class="dayinfo"><div class="dhead">${Number(r.m.slice(5))}月${r.partial ? '（集計途中）' : ''}
      ${diff !== null ? `<span class="wd ${diff >= 0 ? '' : 'sun'}" style="font-size:12px">
        ${Number(P.months[firstIdx].slice(5))}月から ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</span>` : ''}</div>
      <div class="dgrid">
        <div><span>総売上</span><b>${yen(x.gross)}円</b></div>
        <div><span>客数</span><b>${x.customers}人</b></div>
        <div><span>客単価</span><b>${yen(x.avg)}円</b></div>
        <div><span>出勤</span><b>${x.workdays}日</b></div>
        <div><span>1日あたり</span><b>${yen(x.net_per_day)}円</b></div>
        <div><span>店販</span><b>${yen(x.goods)}円</b></div>
        <div><span>次回予約</span><b>${x.rebook_made && x.rebook_made.take_rate !== null ? pct(x.rebook_made.take_rate) : '—'}</b></div>
        <div><span>トリートメント</span><b>${pct(x.treat_rate)}</b></div>
      </div></div>` : '<p class="mini">この月は対象外です。</p>'}
    <p class="mini" style="margin-top:8px">棒をタップすると、その月の数字が出ます。上のボタンで見る項目を変えられます。</p>`;
}

function renderPerson() {
  const d = cur(), s = d.store, x = d.stylists.find(v => v.name === person);
  if (!x) return '<section><div class="panel">この月のデータがありません。</div></section>';
  const pv = prev()?.stylists.find(v => v.name === person), f = x.feedback;
  let h = partial();
  h += `<section><div class="who"><h2>${esc(x.name)}</h2>
    ${f.tag ? `<span class="tag">${esc(f.tag)}</span>` : ''}</div></section>`;
  const ptg = d.target && d.target.stylists[x.name];
  const prate = ptg && ptg.target ? x.gross / ptg.target * 100 : null;
  h += `<div class="hero"><div class="lab">総売上</div>
    <div class="big">${yen(x.gross)}<span style="font-size:.5em;font-weight:600"> 円</span></div>
    <div class="sub">純売上 ${yen(x.net)}円　${delta(x.gross, pv?.gross) || ''}　担当 ${x.customers}人</div>
    ${ptg ? `<div class="goalline ${prate >= 100 ? 'hit' : 'miss'}">
      <span>月間目標 <span class="amt">${yen(ptg.target)}円</span></span><b>${pct(prate)}</b>
      <span>${x.gross >= ptg.target ? '達成しました' : 'あと ' + yen(ptg.target - x.gross) + '円'}</span></div>
      <div class="track" style="margin-top:8px;height:7px">
        <i class="${prate >= 100 ? 'ok' : 'bad'}" style="width:${Math.min(100, prate).toFixed(1)}%"></i></div>` : ''}
    <div style="margin-top:14px">${chart('gross', false, '円')}</div>
    <p class="mini" style="margin-top:6px">棒をタップすると、その月に切り替わります。</p></div>`;
  h += `<section><h2 class="c-teal">成長の推移</h2>
    <p class="lede">${esc(x.name)}さんの月ごとの動きです。</p>
    <div class="panel">${growthBlock(x.name)}</div></section>`;
  h += `<div class="strip">
    <div><div class="k">総売上（割引前）</div><div class="v">${yen(x.gross)}</div><div class="d">${delta(x.gross, pv?.gross) || '円'}</div></div>
    <div><div class="k">純売上</div><div class="v">${yen(x.net)}</div><div class="d">割引 ${yen(x.gross - x.net)}円を差引</div></div>
    <div><div class="k">客単価</div><div class="v">${yen(x.avg)}</div><div class="d">店舗 ${yen(s.avg)}円</div></div>
    <div><div class="k">店販売上</div><div class="v">${yen(x.goods)}</div><div class="d">${x.goods_buyers}人が購入・平均${yen(x.goods_per_buyer)}円</div></div>
    <div><div class="k">客数</div><div class="v">${yen(x.customers)}</div><div class="d">${delta(x.customers, pv?.customers) || '人'}</div></div>
    <div><div class="k">新規率／指名率</div><div class="v">${pct(x.new_rate)}／${pct(x.nom_rate)}</div><div class="d">店舗 新規 ${pct(s.new_rate)}</div></div>
  </div>`;
  const tg = d.target && d.target.stylists[x.name];
  if (tg) {
    const r = tg.target ? tg.actual / tg.target * 100 : 0;
    const rest = Math.max(0, tg.target - tg.actual);
    h += `<section><h2>${Number(month.slice(5))}月の目標</h2>
      <p class="lede">出勤${tg.days}日 × 1日あたり ${yen(tg.base_per_day)}円（${Number(tg.best_month.slice(5))}月に出した水準）。
      いずれも総売上です。</p>
      <div class="panel goal"><div class="g">
        <span class="n">総売上</span><span class="val">${yen(tg.actual)}円</span>
        <span class="tgt">目標 ${yen(tg.target)}円　${rest > 0 ? 'あと ' + yen(rest) + '円' : '達成しました'}</span>
        <div class="track"><i class="${r >= 100 ? 'ok' : r < 80 ? 'bad' : ''}"
          style="width:${Math.min(100, r).toFixed(1)}%"></i></div>
      </div></div></section>`;
  }

  h += `<section><h2>次回予約</h2>
    <p class="lede">初回来店のお客様から取れた次回予約を、取った月ごとに追いかけています。</p>
    ${rebookBlock(x, s)}</section>`;

  h += `<section><h2 class="c-teal">日ごとの売上</h2>
    <p class="lede">「一覧」を押すと、日にちごとの表になります。</p>
    <div class="panel">${dailyBlock(x.daily, 'dp')}</div></section>`;

  h += `<section><h2 class="c-orange">売上の内訳</h2>
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
  h += `<section><h2 class="c-purple">フィードバック</h2><div class="panel">`;
  if (f.trend?.length) { h += `<h3>前月からの変化</h3>` + notes(f.trend.map(t => t.text), ''); }
  if (f.strengths.length) h += `<h3>強み</h3>` + notes(f.strengths, 'g');
  if (f.issues.length) h += `<h3>伸びしろ</h3>` + notes(f.issues, 'r');
  if (f.actions.length) h += `<h3>次の一手</h3>` + notes(f.actions, 'y');
  h += `</div></section>`;
  return h;
}

let scrollTop = false;

/* ---- ページ内の項目を上部に並べ、タップで移動する ---- */
const secBar = document.getElementById('sectab');

function headerH() {
  return document.querySelector('.top').getBoundingClientRect().height;
}

function buildSecTabs() {
  const view = document.getElementById('view');
  const parts = [];
  const hero = view.querySelector('.hero');
  if (hero) {
    hero.id = 'sec-top';
    parts.push(['sec-top', '概要']);
  }
  view.querySelectorAll('section').forEach((sec, i) => {
    const h = sec.querySelector('h2');
    if (!h) return;
    const id = 'sec-' + i;
    sec.id = id;
    parts.push([id, h.textContent.trim()]);
  });
  if (parts.length < 2) { secBar.innerHTML = ''; secBar.hidden = true; return; }
  secBar.hidden = false;
  secBar.innerHTML = parts.map(([id, label], i) =>
    `<button type="button" class="sectab-b" data-id="${id}"
      aria-selected="${i === 0}">${esc(label)}</button>`).join('');
  markSec();
}

function markSec() {
  const btns = [...secBar.querySelectorAll('.sectab-b')];
  if (!btns.length) return;
  const line = headerH() + 24;
  let cur = btns[0];
  btns.forEach(b => {
    const el = document.getElementById(b.dataset.id);
    if (el && el.getBoundingClientRect().top <= line) cur = b;
  });
  btns.forEach(b => b.setAttribute('aria-selected', String(b === cur)));
  const on = secBar.querySelector('.sectab-b[aria-selected="true"]');
  if (on) {
    const l = on.offsetLeft - secBar.clientWidth / 2 + on.clientWidth / 2;
    secBar.scrollTo({left: Math.max(0, l), behavior: 'smooth'});
  }
}

// 上部バーは指でもマウスでも横に引ける
let barDown = false, barX = 0, barLeft = 0, barMoved = false;
secBar.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') return;   // 指のときは端末の横スクロールに任せる
  barDown = true; barMoved = false;
  barX = e.clientX; barLeft = secBar.scrollLeft;
  secBar.classList.add('grabbing');
});
secBar.addEventListener('pointermove', e => {
  if (!barDown) return;
  const dx = e.clientX - barX;
  if (Math.abs(dx) > 4) barMoved = true;
  secBar.scrollLeft = barLeft - dx;
});
const barUp = () => { barDown = false; secBar.classList.remove('grabbing'); };
secBar.addEventListener('pointerup', barUp);
secBar.addEventListener('pointerleave', barUp);
secBar.addEventListener('pointercancel', barUp);

secBar.addEventListener('click', ev => {
  if (barMoved) { barMoved = false; return; }
  const b = ev.target.closest('.sectab-b');
  if (!b) return;
  const el = document.getElementById(b.dataset.id);
  if (!el) return;
  const y = window.scrollY + el.getBoundingClientRect().top - headerH() - 10;
  window.scrollTo({top: Math.max(0, y), behavior: 'smooth'});
});

let spy = null;
window.addEventListener('scroll', () => {
  if (spy) return;
  spy = setTimeout(() => { spy = null; markSec(); }, 120);
}, {passive: true});

function setTopVar() {
  document.documentElement.style.setProperty('--topH', headerH() + 'px');
}
window.addEventListener('resize', () => { setTopVar(); markSec(); });

function render() {
  document.getElementById('vtitle').innerHTML =
    esc(VIEW_NAME[view] || '') +
    (VIEW_MARK[view] ? `<span class="homemark">${VIEW_MARK[view]}</span>` : '');
  document.querySelectorAll('.mitem').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.v === view)));
  selS.innerHTML = '';
  stylists().forEach(v => selS.add(new Option(v.name, v.name)));
  if (!person || !stylists().some(v => v.name === person)) person = stylists()[0]?.name;
  if (person) selS.value = person;
  const show = view === 'person';
  selS.hidden = !show; lblS.hidden = !show;
  document.getElementById('view').innerHTML =
    view === 'store' ? renderStore() : view === 'rank' ? renderRank()
    : view === 'rebook' ? renderRebook() : view === 'goal' ? renderGoal() : renderPerson();
  if (scrollTop) { window.scrollTo({top: 0, behavior: 'instant'}); }
  scrollTop = false;
  buildSecTabs();
  setTopVar();
}

document.getElementById('view').addEventListener('click', ev => {
  const st = ev.target.closest('.stab');
  if (st) { subTab[st.dataset.s] = st.dataset.k; render(); return; }
  const fw = ev.target.closest('.fwho');
  if (fw) { fcWho = fw.dataset.w; render(); return; }
  const fr = ev.target.closest('.frange');
  if (fr) { fcRange = Number(fr.dataset.r); fcSel = null; render(); return; }
  const fm = ev.target.closest('.fmetric');
  if (fm) { fcKey = fm.dataset.k; render(); return; }
  const fb = ev.target.closest('.fbar');
  if (fb) { fcSel = Number(fb.dataset.i); render(); return; }
  const tr = ev.target.closest('.trange');
  if (tr) { trendRange = Number(tr.dataset.r); trendSel = null; render(); return; }
  const tm = ev.target.closest('.tmetric');
  if (tm) { trendKey = tm.dataset.k; render(); return; }
  const tw = ev.target.closest('.twho');
  if (tw) {
    const w = tw.dataset.w;
    if (w === 'one') {
      const act = Object.keys(P.history.stylists);
      trendWho = act.length ? act[0] : 'store';
    } else { trendWho = w; }
    render(); return;
  }
  const tb = ev.target.closest('.tbar');
  if (tb) { trendSel = Number(tb.dataset.i); render(); return; }
  const gt = ev.target.closest('.gtab');
  if (gt) { growthKey = gt.dataset.k; render(); return; }
  const gb = ev.target.closest('.gbar');
  if (gb) { growthSel = Number(gb.dataset.i); render(); return; }
  const bar = ev.target.closest('.dbar');
  if (bar) {
    const id = bar.dataset.t, i = Number(bar.dataset.i);
    const rows = DAILY[id];
    if (rows && rows[i]) document.getElementById(id + '-chart').innerHTML = daily(rows, id, i);
    return;
  }
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

const VIEW_NAME = {store: '店舗全体', rank: 'スタイリスト比較', goal: '目標',
                   rebook: '次回予約', person: '個人カルテ'};
const VIEW_MARK = {store: 'ホーム画面'};
const menu = document.getElementById('menu');
const menuBg = document.getElementById('menubg');
const menuBtn = document.getElementById('menubtn');

function setMenu(open) {
  document.body.classList.toggle('drawer', open);
  menu.setAttribute('aria-hidden', String(!open));
  menuBg.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
}
const menuOpen = () => document.body.classList.contains('drawer');
menuBtn.addEventListener('click', () => setMenu(!menuOpen()));

// 画面の左端から右へなぞるとメニューが開く。開いているときは左へなぞると閉じる。
let swX = null, swY = null;
document.addEventListener('touchstart', e => {
  const t = e.touches[0];
  swX = t.clientX; swY = t.clientY;
}, {passive: true});
document.addEventListener('touchend', e => {
  if (swX === null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swX, dy = t.clientY - swY, startX = swX;
  swX = null;
  if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
  if (dx > 0 && startX < 70 && !menuOpen()) setMenu(true);
  else if (dx < 0 && menuOpen()) setMenu(false);
}, {passive: true});
menuBg.addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
document.querySelectorAll('.mitem').forEach(b => b.addEventListener('click', () => {
  view = b.dataset.v; setMenu(false); scrollTop = true; render();
}));
selM.addEventListener('change', e => { month = e.target.value; render(); });
selS.addEventListener('change', e => { person = e.target.value; render(); });
render();
</script>

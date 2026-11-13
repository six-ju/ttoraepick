/* 또래픽 어드민 SPA (vanilla JS, 의존성 없음). 해시 라우팅: #/dashboard ... */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => Number(n || 0).toLocaleString('ko-KR');
  const won = n => '₩' + num(Math.round(n || 0));
  const pct = (a, b) => (b ? (a / b * 100) : 0).toFixed(1) + '%';
  const STATIC = window.TP_ADMIN_STATIC || null; // 정적 데모 빌드에서 주입
  const S = { days: 30, demo: false, me: null, meta: null }; // 2026-11-02 사장님 지시: 데모 데이터 전부 끔
  const AGE = { 10: '10대', 20: '20대', 30: '30대', 40: '40대', 50: '50대', 60: '60대+', all: '미지정' };
  const SRC = { coupang: ['쿠팡', '#E52528'], naver: ['네이버', '#03C75A'], daiso: ['다이소', '#D6001C'], musinsa: ['무신사', '#555'], oliveyoung: ['올리브영', '#84b520'] };
  const CAT = { food: '🍙 식품', health: '🧴 생활/건강', beauty: '💄 뷰티', fashion: '👕 패션의류', acc: '👜 패션잡화', digital: '🎧 디지털/가전', living: '🛋️ 가구/인테리어', sports: '⛺ 스포츠/레저', baby: '🍼 출산/육아' };
  const PRIO = { urgent: ['긴급', 'bad'], high: ['높음', 'warn'], normal: ['보통', 'info'], low: ['낮음', ''] };
  const STATUS = { todo: '할 일', doing: '진행 중', review: '검토', done: '완료', hold: '보류' };

  // ---------- API ----------
  async function api(method, url, body) {
    if (STATIC) {
      if (method !== 'GET') {
        if (STATIC.__write) { try { return await STATIC.__write(method, url, body || {}); } catch (e) { toast(e.message); throw e; } }
        toast('정적 데모에서는 저장되지 않습니다 (서버 실행 시 동작)'); throw new Error('static');
      }
      const key = url.split('?')[0], idm = key.match(/\/(\d+)$/);
      const d = STATIC[key] ?? (idm ? STATIC[key.replace(/\/\d+$/, '/:id')] : undefined);
      if (d === undefined) throw new Error('데모 데이터 없음: ' + key);
      return typeof d === 'function' ? d(new URLSearchParams(url.split('?')[1] || ''), idm ? +idm[1] : null) : JSON.parse(JSON.stringify(d));
    }
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ttorae-admin' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error('로그인 필요'); }
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  }
  const GET = u => api('GET', u), POST = (u, b) => api('POST', u, b), PATCH = (u, b) => api('PATCH', u, b), PUT = (u, b) => api('PUT', u, b), DEL = u => api('DELETE', u);
  const rq = () => `days=${S.days}${S.demo ? '' : '&demo=0'}`;
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
  const can = p => S.me && (S.me.perms.includes('*') || S.me.perms.includes(p) || S.me.perms.includes(p + '.write'));
  const canW = p => S.me && (S.me.perms.includes('*') || S.me.perms.includes(p + '.write'));

  // ---------- 차트 ----------
  const chart = {
    line(el, labels, series, { h = 240, area = true, fmt = num } = {}) {
      const W = 800, H = h, pl = 44, pr = 12, pt = 12, pb = 26;
      const all = series.flatMap(s => s.values), mx = Math.max(1, ...all) * 1.1;
      const x = i => pl + (labels.length < 2 ? 0 : i / (labels.length - 1) * (W - pl - pr)), y = v => pt + (1 - v / mx) * (H - pt - pb);
      const grid = [0, .25, .5, .75, 1].map(f => `<line class="ax" x1="${pl}" x2="${W - pr}" y1="${y(mx * f)}" y2="${y(mx * f)}" stroke-dasharray="${f ? '3 4' : ''}"/><text x="${pl - 8}" y="${y(mx * f) + 4}" text-anchor="end">${fmt(Math.round(mx * f))}</text>`).join('');
      const step = Math.ceil(labels.length / 8);
      const xl = labels.map((l, i) => i % step === 0 || i === labels.length - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(String(l).slice(5))}</text>` : '').join('');
      const paths = series.map((s, si) => {
        const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
        const gid = 'g' + Math.random().toString(36).slice(2, 7);
        return `${area ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${x(s.values.length - 1)} ${y(0)} L${x(0)} ${y(0)}Z" fill="url(#${gid})"/>` : ''}
          <path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" style="stroke-dasharray:3000;stroke-dashoffset:3000;animation:dash 1.4s ${si * .15}s cubic-bezier(.2,.8,.2,1) forwards"/>`;
      }).join('');
      el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${h}px">${grid}${xl}${paths}<line class="hov" x1="0" x2="0" y1="${pt}" y2="${H - pb}" stroke="var(--ink3)" stroke-dasharray="3 3" opacity="0"/></svg><div class="tip"></div></div>
        <div class="legend">${series.map(s => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)} <b>${fmt(s.values.reduce((a, b) => a + b, 0))}</b></span>`).join('')}</div>`;
      const svg = $('svg', el), tip = $('.tip', el), hov = $('.hov', el);
      svg.addEventListener('mousemove', e => {
        const r = svg.getBoundingClientRect(), rx = (e.clientX - r.left) / r.width * W;
        const i = Math.max(0, Math.min(labels.length - 1, Math.round((rx - pl) / (W - pl - pr) * (labels.length - 1))));
        hov.setAttribute('x1', x(i)); hov.setAttribute('x2', x(i)); hov.setAttribute('opacity', 1);
        tip.innerHTML = `<b>${esc(labels[i])}</b><br>${series.map(s => `<span style="color:${s.color}">●</span> ${esc(s.name)} ${fmt(s.values[i])}`).join('<br>')}`;
        tip.style.left = (x(i) / W * r.width) + 'px'; tip.style.top = '30px'; tip.style.opacity = 1;
      });
      svg.addEventListener('mouseleave', () => { tip.style.opacity = 0; hov.setAttribute('opacity', 0); });
    },
    bars(el, labels, series, { h = 220, stacked = true, fmt = num } = {}) {
      const W = 800, H = h, pl = 50, pr = 8, pt = 10, pb = 26;
      const tot = labels.map((_, i) => stacked ? series.reduce((s, x) => s + (x.values[i] || 0), 0) : Math.max(...series.map(x => x.values[i] || 0)));
      const mx = Math.max(1, ...tot) * 1.1, bw = (W - pl - pr) / labels.length;
      const y = v => (v / mx) * (H - pt - pb);
      let bars = '';
      labels.forEach((l, i) => {
        let acc = 0;
        series.forEach(s => { const v = s.values[i] || 0, hh = y(v); bars += `<rect x="${pl + i * bw + bw * .18}" y="${H - pb - acc - hh}" width="${bw * .64}" height="${Math.max(0, hh)}" rx="3" fill="${s.color}"><title>${esc(l)} ${esc(s.name)} ${fmt(v)}</title></rect>`; acc += hh; });
      });
      const grid = [0, .5, 1].map(f => `<line class="ax" x1="${pl}" x2="${W - pr}" y1="${H - pb - y(mx * f)}" y2="${H - pb - y(mx * f)}" stroke-dasharray="3 4"/><text x="${pl - 8}" y="${H - pb - y(mx * f) + 4}" text-anchor="end">${fmt(Math.round(mx * f))}</text>`).join('');
      const step = Math.ceil(labels.length / 10);
      const xl = labels.map((l, i) => i % step === 0 ? `<text x="${pl + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(String(l).length > 7 ? String(l).slice(5) : l)}</text>` : '').join('');
      el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${h}px">${grid}<g style="transform-origin:0 ${H - pb}px;animation:barUp .9s cubic-bezier(.2,.8,.2,1)">${bars}</g>${xl}</svg></div>
        <div class="legend">${series.map(s => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)} <b>${fmt(s.values.reduce((a, b) => a + b, 0))}</b></span>`).join('')}</div>`;
    },
    donut(el, items, { size = 170, fmt = num, center = '' } = {}) {
      const tot = items.reduce((s, x) => s + x.value, 0) || 1, R = 70, C = 2 * Math.PI * R;
      let off = 0;
      const arcs = items.map(it => { const len = it.value / tot * C; const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${it.color}" stroke-width="26" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"><title>${esc(it.label)} ${fmt(it.value)}</title></circle>`; off += len; return s; }).join('');
      el.innerHTML = `<div class="row" style="gap:18px;flex-wrap:nowrap"><svg viewBox="0 0 180 180" style="width:${size}px;height:${size}px;flex-shrink:0;animation:spin .9s cubic-bezier(.2,.8,.2,1)">${arcs}<text x="90" y="86" text-anchor="middle" style="font-size:22px;font-weight:800;fill:var(--ink)">${esc(center || fmt(tot))}</text><text x="90" y="106" text-anchor="middle" style="font-size:11px;fill:var(--ink3)">합계</text></svg>
        <div class="list" style="flex:1;min-width:0">${items.map(it => `<div class="li"><i class="dot" style="background:${it.color}"></i>${esc(it.label)}<span class="sp"></span><b>${fmt(it.value)}</b><span class="muted" style="width:46px;text-align:right">${pct(it.value, tot)}</span></div>`).join('')}</div></div>`;
    },
    hbars(el, items, { fmt = num } = {}) {
      const mx = Math.max(1, ...items.map(i => i.value));
      el.innerHTML = items.map(i => `<div class="hbar"><span>${esc(i.label)}</span><div class="tr"><div class="fl" style="width:${i.value / mx * 100}%;${i.color ? 'background:' + i.color : ''}"></div></div><span class="n">${fmt(i.value)}</span></div>`).join('') || '<div class="empty">데이터 없음</div>';
    },
    heat(el, rows) {
      const m = Array.from({ length: 7 }, () => Array(24).fill(0)); rows.forEach(r => { m[r.dow][r.h] = r.n; });
      const mx = Math.max(1, ...m.flat()), D = ['일', '월', '화', '수', '목', '금', '토'];
      el.innerHTML = `<div class="heat"><span></span>${Array.from({ length: 24 }, (_, h) => `<span style="text-align:center">${h % 3 ? '' : h}</span>`).join('')}${m.map((r, d) => `<span>${D[d]}</span>${r.map((v, h) => `<i style="opacity:${(.06 + v / mx * .94).toFixed(2)}" title="${D[d]} ${h}시: ${v}"></i>`).join('')}`).join('')}</div>`;
    },
    spark(values, color = '#ff4a5c') {
      if (!values.length) return '';
      const mx = Math.max(1, ...values), W = 90, H = 34;
      const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, values.length - 1) * W).toFixed(1)} ${(H - 2 - v / mx * (H - 4)).toFixed(1)}`).join(' ');
      return `<svg class="spk" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
    },
  };
  document.head.insertAdjacentHTML('beforeend', '<style>@keyframes dash{to{stroke-dashoffset:0}}@keyframes barUp{from{transform:scaleY(0)}}@keyframes spin{from{transform:rotate(-40deg);opacity:0}}</style>');
  const fillDays = (rows, key = 'd') => { const out = []; const map = new Map(rows.map(r => [r[key], r])); for (let i = S.days - 1; i >= 0; i--) { const d = new Date(Date.now() + 9 * 3600e3 - i * 864e5).toISOString().slice(0, 10); out.push(map.get(d) || { [key]: d }); } return out; };

  // ---------- 라우팅 ----------
  const PAGES = [
    { g: '개요' },
    { id: 'dashboard', ic: '📊', t: '대시보드', perm: 'dashboard' },
    { id: 'analytics', ic: '🔎', t: '검색·유입 분석', perm: 'analytics' },
    { g: '상품 / 콘텐츠' },
    { id: 'products', ic: '🛍️', t: '상품 관리', perm: 'products' },
    { id: 'keywords', ic: '🔥', t: '연령별 키워드', perm: 'keywords' },
    { id: 'curations', ic: '🎁', t: '기획전', perm: 'curations' },
    { id: 'collectors', ic: '🤖', t: '데이터 수집기', perm: 'collectors' },
    { g: '수익' },
    { id: 'revenue', ic: '💰', t: '제휴 수익', perm: 'revenue' },
    { id: 'ads', ic: '📢', t: '광고 관리', perm: 'ads' },
    { id: 'adinsight', ic: '📈', t: '광고 분석', perm: 'ads' },
    { g: '조직 / 운영' },
    { id: 'org', ic: '🏢', t: '조직·직원', perm: 'dashboard' },
    { id: 'tasks', ic: '✅', t: '업무 보드', perm: 'tasks' },
    { id: 'settings', ic: '⚙️', t: '설정', perm: 'settings' },
    { id: 'logs', ic: '📜', t: '감사 로그', perm: 'logs' },
  ];
  function renderNav() {
    $('#nav').innerHTML = PAGES.map(p => p.g ? `<div class="nav-g">${p.g}</div>` : (can(p.perm) ? `<a class="nav-a" href="#/${p.id}" data-p="${p.id}"><span class="ic">${p.ic}</span>${p.t}</a>` : '')).join('');
  }
  let liveTimer = null;
  const RO_NOTE = { products: '상품 등록·수정·삭제·가져오기', curations: '기획전 추가·수정·삭제 (엔진 config/curations.json 으로 대신 관리해요)', collectors: '수집기 실행·켜기/끄기 (엔진이 하루 2번 자동 실행해요)', ads: '광고 자리 저장', settings: '사이트 설정 저장·비밀번호 변경·데모 데이터 삭제', org: '직원 추가·권한 변경' };
  async function route() {
    clearInterval(liveTimer);
    const id = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'dashboard';
    const pg = PAGES.find(p => p.id === id) || PAGES[1];
    $$('.nav-a').forEach(a => a.classList.toggle('on', a.dataset.p === pg.id));
    $('#pageTitle').textContent = pg.t;
    $('#side').classList.remove('open');
    const v = $('#view');
    v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
    v.innerHTML = '<div class="grid g4"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div><div class="skel" style="height:300px"></div>';
    try { await VIEWS[pg.id](v); } catch (e) { if (e.message !== 'static') v.innerHTML = `<div class="card empty">⚠️ ${esc(e.message)}</div>`; }
    if (STATIC && STATIC.__fb && RO_NOTE[pg.id]) v.insertAdjacentHTML('afterbegin', `<div class="card" style="margin-bottom:12px;border-left:4px solid #f5a623"><b>🔒 조회만 가능해요</b> · 정적 사이트에서는 ${RO_NOTE[pg.id]} 기능이 막혀 있어요. 필요하면 업무 보드에 적어 주세요.</div>`);
  }
  addEventListener('hashchange', route);

  // ---------- 화면들 ----------
  const delta = (c, p) => { if (!p) return c ? '<span class="d up">▲ 신규</span>' : '<span class="d flat">-</span>'; const r = (c - p) / p * 100; return `<span class="d ${r > 0.5 ? 'up' : r < -0.5 ? 'down' : 'flat'}">${r > 0 ? '▲' : r < 0 ? '▼' : ''} ${Math.abs(r).toFixed(1)}% <span class="muted" style="font-weight:500">이전 ${S.days}일 대비</span></span>`; };
  const VIEWS = {};
  // 카카오 애드핏 실적 카드 (대시보드·광고 화면 공용). 데이터는 어제까지(애드핏은 당일 데이터 미제공), 30분 캐시
  async function renderAdfit(el, days = 30) {
    if (!el) return;
    let d;
    try { d = await GET('/api/admin/adfit?days=' + days); } catch (e) { d = { error: 'fail', message: e.message }; }
    if (!el.isConnected) return;
    if (d.error) {
      el.innerHTML = `<h3>📢 카카오 애드핏</h3><p class="muted" style="margin:0">${d.error === 'no_key' ? '애드핏 리포트 API 키가 아직 없어요. 애드핏 고객센터(카카오톡 채널)에 <b>리포트 API 권한</b>을 요청하면 <b>관리 &gt; API 키 관리</b> 메뉴가 생기고, 키를 발급해 주시면 여기에 바로 수익·노출·클릭이 나와요.' : d.error === 'forbidden' ? '사장님 계정 확인에 실패했어요. 다시 로그인해 주세요.' : '애드핏 데이터를 가져오지 못했어요: ' + esc(d.message || d.error)}</p>`;
      return;
    }
    const rows = d.rows || [], sum = k => rows.reduce((s, r) => s + (+r[k] || 0), 0);
    const byDay = {}; rows.forEach(r => { const x = byDay[r.d] ||= { profit: 0, imp: 0, clicks: 0 }; x.profit += +r.profit || 0; x.imp += +r.vimp || +r.imp || 0; x.clicks += +r.clicks || 0; });
    const dates = Object.keys(byDay).sort(), last = dates[dates.length - 1], y = byDay[last] || { profit: 0, imp: 0, clicks: 0 };
    const last7 = dates.slice(-7).reduce((s, k) => s + byDay[k].profit, 0);
    const byUnit = {}; rows.forEach(r => { const u = byUnit[r.unit] ||= { name: r.unitName, media: r.media, profit: 0, imp: 0, clicks: 0, req: 0 }; u.profit += +r.profit || 0; u.imp += +r.vimp || +r.imp || 0; u.clicks += +r.clicks || 0; u.req += +r.req || 0; });
    const imp = sum('vimp') || sum('imp'), clk = sum('clicks');
    el.innerHTML = `<h3>📢 카카오 애드핏 <span class="sub">${esc(d.from)} ~ ${esc(d.to)} · ${d.cached ? '30분 캐시' : '방금 조회'}</span></h3>
      <div class="grid g4 kpis" style="margin-bottom:12px">
        <div class="card kpi"><div class="lb">어제 적립금 (${esc(last || '-')})</div><div class="v">${won(y.profit)}</div><span class="muted">노출 ${num(y.imp)} · 클릭 ${num(y.clicks)}</span></div>
        <div class="card kpi"><div class="lb">최근 7일 적립금</div><div class="v">${won(last7)}</div></div>
        <div class="card kpi"><div class="lb">${days}일 적립금</div><div class="v">${won(sum('profit'))}</div>${dates.length > 1 ? chart.spark(dates.map(k => byDay[k].profit), '#ff4a5c') : ''}</div>
        <div class="card kpi"><div class="lb">${days}일 노출 / 클릭</div><div class="v">${num(imp)} / ${num(clk)}</div><span class="muted">CTR ${imp ? (clk / imp * 100).toFixed(2) : '0.00'}%</span></div>
      </div>
      <div class="tbl-wrap"><table><thead><tr><th>광고단위</th><th>매체</th><th class="num">요청</th><th class="num">노출</th><th class="num">클릭</th><th class="num">적립금</th></tr></thead><tbody>
      ${Object.entries(byUnit).sort((a, b) => b[1].profit - a[1].profit || b[1].imp - a[1].imp).map(([id, u]) => `<tr><td><b>${esc(u.name || id)}</b><br><code>${esc(id)}</code></td><td>${esc(u.media || '')}</td><td class="num">${num(u.req)}</td><td class="num">${num(u.imp)}</td><td class="num">${num(u.clicks)}</td><td class="num"><b>${won(u.profit)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">아직 실적이 없어요 (매체 심사 중이거나 노출 전)</td></tr>'}
      </tbody></table></div>`;
  }

  // 광고 분석: AI가 애드핏 화면(보고서)을 직접 보고 정리해 Firestore admin/main/adinsight/latest 에 저장한 내용을 보여줌
  VIEWS.adinsight = async v => {
    const d = await GET('/api/admin/adinsight');
    if (!d) { v.innerHTML = '<div class="card empty">아직 분석이 없어요. AI에게 "애드핏 분석 갱신"을 요청하세요.</div>'; return; }
    const s = d.summary || {}, pc = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
    const lv = { danger: '🚨', warn: '⚠️', good: '✅', info: 'ℹ️' };
    v.innerHTML = `<p class="muted" style="margin:0 0 12px">애드핏 ${esc(d.period?.from || '')} ~ ${esc(d.period?.to || '')} · 분석 ${esc((d.updated_at || '').replace('T', ' ').slice(0, 16))}</p>
      <div class="grid g4 kpis">
        <div class="card kpi"><div class="lb">적립금</div><div class="v">${won(s.profit || 0)}</div><span class="muted">eCPM ${num(s.view ? Math.round(s.profit / s.view * 1000) : 0)}원</span></div>
        <div class="card kpi"><div class="lb">광고 요청 / 실제 보임</div><div class="v">${num(s.req)} / ${num(s.view)}</div><span class="muted">보임률 ${pc(s.view, s.imp)}</span></div>
        <div class="card kpi"><div class="lb">클릭 / CTR</div><div class="v">${num(s.click)} / ${pc(s.click, s.view)}</div><span class="muted">보통 0.1~1%</span></div>
        <div class="card kpi"><div class="lb">사이트 페이지뷰 (사장님 제외)</div><div class="v">${num(d.site?.pageviews)}</div><span class="muted">페이지당 광고 요청 ${d.site?.pageviews ? (s.req / d.site.pageviews).toFixed(1) : '-'}회</span></div>
      </div>
      <div class="card" style="margin-top:14px"><h3>핵심 진단</h3>${(d.findings || []).map(f => `<div style="margin:10px 0"><b>${lv[f.lv] || ''} ${esc(f.t)}</b><div class="muted" style="margin-top:4px;white-space:pre-line">${esc(f.b)}</div></div>`).join('')}</div>
      <div class="card" style="margin-top:14px"><h3>클릭·수익을 늘리려면 (정책 안에서)</h3><ol style="margin:0;padding-left:20px">${(d.actions || []).map(a => `<li style="margin:8px 0"><b>${esc(a.t)}</b><div class="muted" style="white-space:pre-line">${esc(a.b)}</div></li>`).join('')}</ol></div>
      <div class="card" style="margin-top:14px"><h3>광고 자리별 성과</h3><div class="tbl-wrap"><table><thead><tr><th>광고 자리</th><th class="num">요청</th><th class="num">노출</th><th class="num">실제 보임</th><th class="num">보임률</th><th class="num">클릭</th><th class="num">CTR</th><th class="num">적립금</th></tr></thead><tbody>
        ${(d.units || []).map(u => `<tr><td><b>${esc(u.name)}</b>${u.note ? `<br><span class="muted">${esc(u.note)}</span>` : ''}</td><td class="num">${num(u.req)}</td><td class="num">${num(u.imp)}</td><td class="num">${num(u.view)}</td><td class="num">${pc(u.view, u.imp)}</td><td class="num">${num(u.click)}</td><td class="num">${pc(u.click, u.view)}</td><td class="num">${won(u.profit)}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card" style="margin-top:14px"><h3>일별</h3><div class="tbl-wrap"><table><thead><tr><th>날짜</th><th class="num">사이트 PV</th><th class="num">광고 요청</th><th class="num">실제 보임</th><th class="num">클릭</th><th class="num">적립금</th></tr></thead><tbody>
        ${(d.daily || []).map(x => `<tr><td>${esc(x.d)}</td><td class="num">${x.pv == null ? '-' : num(x.pv)}</td><td class="num">${num(x.req)}</td><td class="num">${num(x.view)}</td><td class="num">${num(x.click)}</td><td class="num">${won(x.profit)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  };

  VIEWS.dashboard = async v => {
    const d = await GET('/api/admin/dashboard?' + rq());
    const c = d.cur, p = d.prev;
    const days = fillDays(d.daily);
    const revTotal = (c.commission || 0), prevRev = (p.commission || 0);
    const kpis = [
      ['👥 방문자 (세션)', c.visitors, p.visitors, days.map(x => x.pageviews || 0)],
      ['📄 페이지뷰', c.pageviews, p.pageviews, days.map(x => x.pageviews || 0)],
      ['👀 상품 상세 조회', c.views, p.views, days.map(x => x.views || 0)],
      ['🛒 구매 이동 (아웃링크)', c.clicks, p.clicks, days.map(x => x.clicks || 0)],
      ['🎯 구매 전환율 (이동/조회)', null, null, null, pct(c.clicks, c.views), pct(p.clicks, p.views)],
      ['🤍 찜', c.wishes, p.wishes, days.map(x => x.wishes || 0)],
      ['🔍 검색', c.searches, p.searches, days.map(x => x.searches || 0)],
      ['💰 수익 합계 (제휴+광고)', revTotal, prevRev, null, won(revTotal)],
    ];
    const ap = d.coupangApproval, apPct = Math.min(100, ap.gmv / ap.goal * 100);
    $('#banner').hidden = !(d.demoCount && S.demo);
    $('#banner').innerHTML = `ℹ️ 데모(가상) 데이터 ${num(d.demoCount)}건이 포함되어 있습니다. 실제 운영 데이터만 보려면 상단 <b>데모 포함</b>을 끄세요. 설정 &gt; 데모 데이터 삭제로 지울 수 있습니다.`;
    v.innerHTML = `
      <div class="grid g4 kpis">${kpis.map(([lb, cv, pv, sp, txt, ptxt], i) => `<div class="card kpi ${i === 7 ? 'accent' : ''}"><div class="lb">${lb}</div><div class="v">${txt || num(cv)}</div>${txt && ptxt ? `<span class="d flat">이전 ${ptxt}</span>` : delta(cv, pv)}${sp ? chart.spark(sp, i === 7 ? '#fff' : '#ff4a5c') : ''}</div>`).join('')}</div>
      
      <div class="grid g21">
        <div class="card"><h3>📈 일별 트래픽 <span class="sub">KST 기준</span></h3><div id="cTraffic"></div></div>
        <div class="card"><h3>🛍️ 쇼핑몰별 구매 이동</h3><div id="cSource"></div></div>
      </div>
      <div class="grid g21">
        <div class="card"><h3>💵 일별 수익 <span class="sub">쿠팡 파트너스 + AdSense</span></h3><div id="cRev"></div></div>
        <div class="card"><h3>🏁 쿠팡 파트너스 최종 승인</h3>
          <p class="muted" style="margin:0 0 10px">누적 판매액 ${won(ap.gmv)} / ${won(ap.goal)} 달성 시 최종 승인 → Open API 키 발급</p>
          <div class="prog"><i style="width:${apPct}%"></i></div><p style="margin:8px 0 18px;font-weight:800;font-size:22px">${apPct.toFixed(1)}%</p>
          <h3 style="margin-top:6px">📦 카탈로그</h3>
          <div class="list">
            <div class="li">전체 상품<span class="sp"></span><b>${num(d.catalog.total)}</b></div>
            <div class="li">노출 중<span class="sp"></span><b>${num(d.catalog.active)}</b></div>
            <div class="li">제휴 링크 보유<span class="sp"></span><b>${num(d.catalog.affiliate)}</b><span class="muted">${pct(d.catalog.affiliate, d.catalog.total)}</span></div>
            <div class="li">3일 이상 미갱신<span class="sp"></span><b class="${d.catalog.stale ? 'tag warn' : ''}">${num(d.catalog.stale)}</b></div>
            <div class="li">키워드 기준일<span class="sp"></span><b>${esc(d.keywordDate || '-')}</b></div>
          </div></div>
      </div>
      <div class="grid g3">
        <div class="card"><h3>🎂 연령별 조회 / 이동</h3><div id="cAge"></div></div>
        <div class="card"><h3>🗂️ 카테고리별 구매 이동</h3><div id="cCat"></div></div>
        <div class="card"><h3>🔻 전환 퍼널 <span class="sub">세션 기준</span></h3><div class="funnel" id="cFunnel"></div>
          <h3 style="margin-top:20px">📱 기기</h3><div id="cDev"></div></div>
      </div>
      <div class="grid g21">
        <div class="card"><h3>🏆 TOP 상품 <span class="sub">구매 이동순</span></h3><div class="tbl-wrap"><table><thead><tr><th></th><th>상품</th><th>쇼핑몰</th><th class="num">조회</th><th class="num">이동</th><th class="num">CTR</th><th class="num">찜</th></tr></thead><tbody>
          ${d.topProducts.map(t => `<tr class="clickable" data-pid="${t.id}"><td><img class="pimg" src="${esc(t.image)}" referrerpolicy="no-referrer" alt=""></td><td><span class="ptitle">${esc(t.title)}</span><span class="muted">${esc(t.brand || '')} · ${won(t.price)}</span></td><td>${srcTag(t.source)}${t.aff ? ' <span class="tag ok">제휴</span>' : ''}</td><td class="num">${num(t.views)}</td><td class="num"><b>${num(t.clicks)}</b></td><td class="num">${pct(t.clicks, t.views)}</td><td class="num">${num(t.wishes)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">아직 데이터가 없습니다</td></tr>'}
        </tbody></table></div></div>
        <div class="card"><h3>🔍 인기 검색어</h3><div class="list">${d.topSearches.map((s, i) => `<div class="li"><b style="width:20px">${i + 1}</b>${esc(s.k)}<span class="sp"></span>${s.zero ? `<span class="tag warn">결과없음 ${s.zero}</span>` : ''}<b>${num(s.n)}</b></div>`).join('') || '<div class="empty">검색 기록 없음</div>'}</div>
          <h3 style="margin-top:18px">⚠️ 결과 없는 검색어 <span class="sub">MD 상품 보강 필요</span></h3><div class="row">${d.zeroSearches.map(z => `<span class="tag warn">${esc(z.k)} · ${z.n}</span>`).join('') || '<span class="muted">없음 👍</span>'}</div></div>
      </div>
      <div class="grid g3">
        <div class="card"><h3>🕒 시간대별 반응 <span class="sub">조회+이동, KST</span></h3><div id="cHeat"></div></div>
        <div class="card"><h3>🤖 수집기 상태</h3><div class="list">${d.jobs.map(j => `<div class="li">${statusTag(j.last_status, j.enabled)}<span>${esc(j.name)}</span><span class="sp"></span><span class="muted">${ago(j.last_run_at)}</span></div>`).join('')}</div></div>
        <div class="card"><h3>✅ 우선 처리 업무 <a class="sub" href="#/tasks">보드 열기 →</a></h3><div class="list">${d.urgentTasks.map(t => `<div class="li"><i class="dot" style="background:${t.color}"></i><span style="flex:1">${esc(t.title)}</span><span class="tag ${PRIO[t.priority][1]}">${PRIO[t.priority][0]}</span></div>`).join('')}</div>
          <h3 style="margin-top:18px">⚡ 실시간 <span class="sub" id="liveN"></span></h3><div class="live list" id="live"></div></div>
      </div>`;
    
    chart.line($('#cTraffic'), days.map(x => x.d), [
      { name: '페이지뷰', color: '#8b5cf6', values: days.map(x => x.pageviews || 0) },
      { name: '상품 조회', color: '#3b82f6', values: days.map(x => x.views || 0) },
      { name: '구매 이동', color: '#ff4a5c', values: days.map(x => x.clicks || 0) },
    ]);
    chart.donut($('#cSource'), d.bySource.map(s => ({ label: s.name || s.k, value: s.clicks, color: s.color || '#999' })));
    const rv = fillDays(Object.values(d.revDaily.reduce((m, r) => { (m[r.d] ||= { d: r.d })[r.channel] = r.commission; return m; }, {})));
    chart.bars($('#cRev'), rv.map(x => x.d), [{ name: '쿠팡 파트너스', color: '#E52528', values: rv.map(x => x.coupang || 0) }, { name: 'AdSense', color: '#fbbc04', values: rv.map(x => x.adsense || 0) }, { name: '기타 제휴', color: '#14b8a6', values: rv.map(x => Object.entries(x).filter(([k]) => !['d', 'coupang', 'adsense'].includes(k)).reduce((s, [, v]) => s + v, 0)) }], { fmt: won });
    chart.hbars($('#cAge'), ['10', '20', '30', '40', '50', '60', 'all'].map(a => { const r = d.byAge.find(x => x.k === a) || {}; return { label: AGE[a], value: r.views || 0 }; }));
    $('#cAge').insertAdjacentHTML('beforeend', `<p class="muted" style="font-size:12px;margin:10px 0 0">이동률: ${d.byAge.filter(x => x.k !== 'all').map(x => `${AGE[x.k]} ${pct(x.clicks, x.views)}`).join(' · ')}</p>`);
    chart.hbars($('#cCat'), d.byCategory.map(x => ({ label: x.name || x.k, value: x.clicks })));
    const f = d.funnel;
    $('#cFunnel').innerHTML = [['방문', f.s1], ['상품 조회', f.s2], ['구매 이동', f.s3]].map(([l, n], i, a) => `<div class="st"><div class="lab"><span>${l}</span><span>${num(n)}${i ? ` · ${pct(n, a[i - 1][1])}` : ''}</span></div><div class="bar" style="width:${Math.max(18, n / Math.max(1, f.s1) * 100)}%">${pct(n, f.s1)}</div></div>`).join('');
    chart.donut($('#cDev'), d.byDevice.map(x => ({ label: { mobile: '모바일', desktop: 'PC', tablet: '태블릿' }[x.k] || x.k || '기타', value: x.sessions, color: { mobile: '#ff4a5c', desktop: '#3b82f6', tablet: '#f59e0b' }[x.k] || '#999' })), { size: 120 });
    chart.heat($('#cHeat'), d.heat);
    $$('[data-pid]', v).forEach(tr => tr.onclick = () => openProduct(+tr.dataset.pid));
    const live = async () => {
      try {
        const l = await GET('/api/admin/live');
        $('#liveN') && ($('#liveN').textContent = `최근 5분 ${l.last5min}명`);
        const L = { pageview: '방문', view: '조회', click: '구매이동', wish: '찜', search: '검색', ad_impression: '광고노출', share: '공유', unwish: '찜해제', ad_click: '광고클릭' };
        $('#live') && ($('#live').innerHTML = l.events.slice(0, 14).map(e => `<div class="li"><span class="tag ${e.type === 'click' ? 'ok' : e.type === 'search' ? 'info' : ''}">${L[e.type] || e.type}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.title || e.query || '')}</span><span class="muted">${e.age ? AGE[e.age] : ''}</span></div>`).join(''));
      } catch { /* */ }
    };
    live(); if (!STATIC) liveTimer = setInterval(live, 10000);
  };

  VIEWS.analytics = async v => {
    const d = await GET('/api/admin/dashboard?' + rq());
    v.innerHTML = `<div class="grid g2">
      <div class="card"><h3>🔍 검색어 TOP</h3><div class="tbl-wrap"><table><thead><tr><th>#</th><th>검색어</th><th class="num">검색수</th><th class="num">평균 결과</th><th class="num">결과 0</th></tr></thead><tbody>${d.topSearches.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.k)}</td><td class="num">${num(s.n)}</td><td class="num">${s.avg_results}</td><td class="num">${s.zero ? `<span class="tag warn">${s.zero}</span>` : 0}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>🎂 연령 x 행동</h3><div class="tbl-wrap"><table><thead><tr><th>연령</th><th class="num">방문</th><th class="num">조회</th><th class="num">이동</th><th class="num">이동률</th></tr></thead><tbody>${d.byAge.map(a => `<tr><td>${AGE[a.k]}</td><td class="num">${num(a.pageviews)}</td><td class="num">${num(a.views)}</td><td class="num">${num(a.clicks)}</td><td class="num"><b>${pct(a.clicks, a.views)}</b></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>🗂️ 카테고리 x 행동</h3><div class="tbl-wrap"><table><thead><tr><th>카테고리</th><th class="num">조회</th><th class="num">이동</th><th class="num">이동률</th></tr></thead><tbody>${d.byCategory.map(a => `<tr><td>${esc(a.icon || '')} ${esc(a.name || a.k)}</td><td class="num">${num(a.views)}</td><td class="num">${num(a.clicks)}</td><td class="num"><b>${pct(a.clicks, a.views)}</b></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>🕒 시간대 히트맵</h3><div id="h2"></div><h3 style="margin-top:20px">📱 기기별</h3><div class="tbl-wrap"><table><thead><tr><th>기기</th><th class="num">세션</th><th class="num">이동</th></tr></thead><tbody>${d.byDevice.map(x => `<tr><td>${esc(x.k)}</td><td class="num">${num(x.sessions)}</td><td class="num">${num(x.clicks)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>🔗 유입 출처 (링크 ?from=)</h3><div class="tbl-wrap"><table><thead><tr><th>출처</th><th class="num">세션</th><th class="num">방문</th><th class="num">조회</th><th class="num">구매이동</th></tr></thead><tbody>${(d.byFrom || []).map(x => `<tr><td>${esc(({ blog: '블로그', th: '스레드', ig: '인스타', yt: '유튜브' })[x.k] || x.k)}</td><td class="num">${num(x.sessions)}</td><td class="num">${num(x.pageviews)}</td><td class="num">${num(x.views)}</td><td class="num"><b>${num(x.clicks)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">아직 출처 표시 링크로 들어온 방문이 없어요 (11/11부터 기록)</td></tr>'}</tbody></table></div></div>
    </div>`;
    chart.heat($('#h2'), d.heat);
  };

  // 상품
  const PS = { q: '', source: '', category: '', age: '', status: '', sort: 'score', offset: 0, sel: new Set() };
  VIEWS.products = async v => {
    const u = new URLSearchParams({ limit: 50, offset: PS.offset, sort: PS.sort });
    ['q', 'source', 'category', 'age', 'status'].forEach(k => PS[k] && u.set(k, PS[k]));
    const d = await GET('/api/admin/products?' + u);
    const w = canW('products');
    v.innerHTML = `<div class="card"><div class="toolbar">
        <input type="search" id="pq" placeholder="상품명·브랜드·키워드" value="${esc(PS.q)}">
        <select id="psrc"><option value="">전체 쇼핑몰</option>${Object.entries(SRC).map(([k, [n]]) => `<option value="${k}" ${PS.source === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select id="pcat"><option value="">전체 카테고리</option>${Object.entries(CAT).map(([k, n]) => `<option value="${k}" ${PS.category === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select id="page_"><option value="">전체 연령</option>${['10', '20', '30', '40', '50', '60'].map(a => `<option value="${a}" ${PS.age === a ? 'selected' : ''}>${AGE[a]}</option>`).join('')}</select>
        <select id="pst"><option value="">전체 상태</option><option value="active" ${PS.status === 'active' ? 'selected' : ''}>노출</option><option value="hidden" ${PS.status === 'hidden' ? 'selected' : ''}>숨김</option><option value="soldout" ${PS.status === 'soldout' ? 'selected' : ''}>품절</option></select>
        <select id="psort">${[['score', '점수순'], ['popular', '연령 순위순'], ['price_asc', '낮은 가격'], ['review', '리뷰순'], ['new', '최신 등록']].map(([k, n]) => `<option value="${k}" ${PS.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <span class="sp"></span>
        ${w ? `<button class="btn" id="pimport">⬆ JSON 가져오기</button><input type="file" id="pfile" accept=".json" hidden><button class="btn" id="padd">＋ 상품 등록</button>` : ''}
        ${can('export') ? `<a class="btn" href="/api/admin/export/products.csv">⬇ CSV</a>` : ''}
      </div>
      ${w ? `<div class="row" style="margin:12px 0 0" id="bulk"><span class="muted"><b id="selN">0</b>개 선택</span><button class="btn sm" data-b="show">노출</button><button class="btn sm" data-b="hide">숨김</button><button class="btn sm" data-b="pin">상단 고정</button><button class="btn sm" data-b="unpin">고정 해제</button><button class="btn sm danger" data-b="delete">삭제</button></div>` : ''}
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr>${w ? '<th><input type="checkbox" id="pall"></th>' : ''}<th></th><th>상품 (${num(d.total)}개)</th><th>쇼핑몰</th><th>카테고리</th><th class="num">가격</th><th>연령 순위</th><th class="num">점수</th><th class="num">30일 조회/이동</th><th>링크</th><th>상태</th></tr></thead><tbody>
      ${d.items.map(p => `<tr>${w ? `<td><input type="checkbox" data-sel="${p.id}" ${PS.sel.has(p.id) ? 'checked' : ''}></td>` : ''}<td><img class="pimg" src="${esc(p.image)}" alt="" referrerpolicy="no-referrer" loading="lazy"></td>
        <td class="clickable" data-pid="${p.id}"><span class="ptitle">${p.pinned ? '📌 ' : ''}${esc(p.title)}</span><span class="muted">${esc(p.brand || '-')}${p.keyword ? ' · #' + esc(p.keyword) : ''}</span></td>
        <td>${srcTag(p.source)}</td><td>${CAT[p.category] || p.category}</td><td class="num">${num(p.price)}</td>
        <td>${Object.entries(p.ages || {}).map(([a, r]) => `<span class="tag">${AGE[a]} ${r}</span>`).join(' ') || '<span class="muted">-</span>'}</td>
        <td class="num">${(p.score || 0).toFixed(1)}</td><td class="num">${num(p.stats.views)} / <b>${num(p.stats.clicks)}</b></td>
        <td>${p.affiliateUrl ? '<span class="tag ok">제휴</span>' : '<span class="tag">원본</span>'}</td>
        <td><span class="tag ${p.status === 'active' ? 'ok' : p.status === 'hidden' ? 'bad' : 'warn'}">${{ active: '노출', hidden: '숨김', soldout: '품절' }[p.status]}</span></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:12px;justify-content:center"><button class="btn" id="pprev" ${PS.offset ? '' : 'disabled'}>← 이전</button><span class="muted">${PS.offset + 1}-${Math.min(PS.offset + 50, d.total)} / ${num(d.total)}</span><button class="btn" id="pnext" ${PS.offset + 50 < d.total ? '' : 'disabled'}>다음 →</button></div></div>`;
    const re = () => { PS.offset = 0; VIEWS.products(v); };
    let qt; $('#pq').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { PS.q = e.target.value; re(); }, 350); };
    [['#psrc', 'source'], ['#pcat', 'category'], ['#page_', 'age'], ['#pst', 'status'], ['#psort', 'sort']].forEach(([s, k]) => { $(s).onchange = e => { PS[k] = e.target.value; re(); }; });
    $('#pprev').onclick = () => { PS.offset = Math.max(0, PS.offset - 50); VIEWS.products(v); };
    $('#pnext').onclick = () => { PS.offset += 50; VIEWS.products(v); };
    $$('[data-pid]', v).forEach(td => td.onclick = () => openProduct(+td.dataset.pid));
    if (w) {
      const upd = () => { $('#selN').textContent = PS.sel.size; };
      $$('[data-sel]', v).forEach(cb => cb.onchange = () => { cb.checked ? PS.sel.add(+cb.dataset.sel) : PS.sel.delete(+cb.dataset.sel); upd(); });
      $('#pall').onchange = e => { $$('[data-sel]', v).forEach(cb => { cb.checked = e.target.checked; e.target.checked ? PS.sel.add(+cb.dataset.sel) : PS.sel.delete(+cb.dataset.sel); }); upd(); };
      upd();
      $$('[data-b]', v).forEach(b => b.onclick = async () => {
        if (!PS.sel.size) return toast('상품을 선택하세요');
        if (b.dataset.b === 'delete' && !confirm(`${PS.sel.size}개 상품을 삭제할까요?`)) return;
        const r = await POST('/api/admin/products/bulk', { ids: [...PS.sel], action: b.dataset.b }); PS.sel.clear(); toast(`${r.n}개 처리됨`); VIEWS.products(v);
      });
      $('#pimport').onclick = () => $('#pfile').click();
      $('#pfile').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try { const r = await POST('/api/admin/import', JSON.parse(await f.text())); toast(`가져오기: 신규 ${r.inserted} · 갱신 ${r.updated} · 제외 ${r.skipped}`); VIEWS.products(v); } catch (er) { toast('가져오기 실패: ' + er.message); }
      };
      $('#padd').onclick = () => productForm(null, () => VIEWS.products(v));
    }
  };
  async function openProduct(id) {
    const p = await GET('/api/admin/products/' + id);
    productForm(p, () => location.hash === '#/products' && VIEWS.products($('#view')));
  }
  function productForm(p, done) {
    const w = canW('products'), isNew = !p;
    p = p || { source: 'coupang', category: 'food', ages: {}, status: 'active' };
    openDrawer(`<h2>${isNew ? '상품 등록' : '상품 상세'}</h2>
      ${p.image ? `<img src="${esc(p.image)}" referrerpolicy="no-referrer" style="width:140px;height:140px;object-fit:cover;border-radius:14px;margin-bottom:12px" alt="">` : ''}
      ${!isNew ? `<div class="row" style="margin-bottom:12px">${srcTag(p.source)}<span class="tag">ID ${p.id}</span><span class="tag">점수 ${(p.score || 0).toFixed(1)}</span><a class="btn sm" href="${esc(p.productUrl)}" target="_blank" rel="noopener">원본 ↗</a>${p.affiliateUrl ? `<a class="btn sm" href="${esc(p.affiliateUrl)}" target="_blank" rel="noopener">제휴 링크 ↗</a>` : ''}</div>` : ''}
      ${!isNew && p.daily?.length ? '<div id="pdaily" style="margin-bottom:14px"></div>' : ''}
      <form class="form" id="pform">
        ${isNew ? `<label>쇼핑몰<select name="source">${Object.entries(SRC).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join('')}</select></label>` : ''}
        <label class="full">상품명<input name="title" value="${esc(p.title)}" required></label>
        <label>브랜드/회사<input name="brand" value="${esc(p.brand)}"></label>
        <label>카테고리<select name="category">${Object.entries(CAT).map(([k, n]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>판매가<input name="price" type="number" value="${p.price ?? ''}"></label>
        <label>정가<input name="originalPrice" type="number" value="${p.originalPrice ?? ''}"></label>
        <label class="full">상품 URL<input name="productUrl" value="${esc(p.productUrl)}" placeholder="https://"></label>
        <label class="full">제휴 링크 (쿠팡 파트너스 등)<input name="affiliateUrl" value="${esc(p.affiliateUrl)}" placeholder="https://link.coupang.com/a/..."></label>
        <label class="full">이미지 URL<input name="image" value="${esc(p.image)}"></label>
        <label>키워드<input name="keyword" value="${esc(p.keyword)}"></label>
        <label>상태<select name="status">${[['active', '노출'], ['hidden', '숨김'], ['soldout', '품절']].map(([k, n]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="full">연령별 순위 (JSON, 예: {"20":1,"30":4})<input name="ages" value='${esc(JSON.stringify(p.ages || {}))}'></label>
        <label class="full">MD 메모<textarea name="memo" rows="3">${esc(p.memo)}</textarea></label>
        <label class="row" style="flex-direction:row"><span class="switch"><input type="checkbox" name="pinned" ${p.pinned ? 'checked' : ''}><span></span></span> 상단 고정</label>
        ${w ? `<div class="full row"><button class="btn primary" type="submit">${isNew ? '등록' : '저장'}</button><button class="btn" type="button" data-close>닫기</button></div>` : ''}
      </form>`);
    if (!isNew && p.daily?.length) { const dd = p.daily; chart.line($('#pdaily'), dd.map(x => x.d), [{ name: '조회', color: '#3b82f6', values: dd.map(x => x.views) }, { name: '이동', color: '#ff4a5c', values: dd.map(x => x.clicks) }], { h: 140 }); }
    $('#pform').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      let ages; try { ages = JSON.parse(f.ages || '{}'); } catch { return toast('연령 JSON 형식 오류'); }
      const body = { ...f, ages, pinned: !!f.pinned, price: f.price ? +f.price : null, originalPrice: f.originalPrice ? +f.originalPrice : null };
      try {
        if (isNew) await POST('/api/admin/products', { ...body, imageUrl: f.image }); else await PATCH('/api/admin/products/' + p.id, body);
        toast('저장했습니다'); closeDrawer(); done && done();
      } catch (er) { toast('실패: ' + er.message); }
    };
  }

  VIEWS.keywords = async v => {
    const d = await GET('/api/admin/keywords?top=10');
    const ages = ['10', '20', '30', '40', '50', '60'];
    const by = {}; d.rows.forEach(r => { ((by[r.category] ||= {})[r.age] ||= []).push(r); });
    v.innerHTML = `<div class="card"><h3>🔥 네이버 데이터랩 연령별 인기 검색어 TOP10 <span class="sub">기준일 ${esc(d.date || '-')} · <b style="color:var(--brand)">빨간색</b> = 상품 매칭됨</span></h3>
      <div class="tbl-wrap"><table class="kwm"><thead><tr><th>카테고리</th>${ages.map(a => `<th>${AGE[a]}</th>`).join('')}</tr></thead><tbody>
      ${Object.entries(CAT).map(([c, n]) => `<tr><td><b>${n}</b></td>${ages.map(a => `<td><ol>${(by[c]?.[a] || []).map(k => `<li class="${k.products ? 'has' : ''}" title="상품 ${k.products}개">${esc(k.keyword)}</li>`).join('')}</ol></td>`).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
  };

  VIEWS.curations = async v => {
    const list = await GET('/api/admin/curations');
    const w = canW('curations');
    v.innerHTML = `<div class="card"><h3>🎁 기획전 <span class="sub">홈 상단 카드로 노출</span>${w ? '<button class="btn sm primary" id="cnew" style="margin-left:10px">＋ 새 기획전</button>' : ''}</h3>
      <div class="tbl-wrap"><table><thead><tr><th>제목</th><th>연령</th><th class="num">상품 수</th><th>상태</th><th></th></tr></thead><tbody>
      ${list.map(c => `<tr><td><b>${esc(c.title)}</b><br><span class="muted">${esc(c.subtitle || '')}</span></td><td>${c.age ? AGE[c.age] : '전체'}</td><td class="num">${c.productIds.length}</td><td>${c.active ? '<span class="tag ok">노출</span>' : '<span class="tag">중지</span>'}</td><td>${w ? `<button class="btn sm" data-ced="${c.id}">편집</button> <button class="btn sm danger" data-cdel="${c.id}">삭제</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">기획전이 없습니다. 연령별 테마(예: 20대 자취 필수템)로 만들어 보세요.</td></tr>'}
      </tbody></table></div></div>`;
    const form = c => {
      c = c || { title: '', subtitle: '', age: '', productIds: [], active: 1 };
      openDrawer(`<h2>${c.id ? '기획전 편집' : '새 기획전'}</h2><form class="form" id="cform">
        <label class="full">제목<input name="title" value="${esc(c.title)}" required></label>
        <label class="full">부제<input name="subtitle" value="${esc(c.subtitle)}"></label>
        <label>대상 연령<select name="age"><option value="">전체</option>${['10', '20', '30', '40', '50', '60'].map(a => `<option value="${a}" ${c.age === a ? 'selected' : ''}>${AGE[a]}</option>`).join('')}</select></label>
        <label class="row" style="flex-direction:row;align-items:center"><span class="switch"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}><span></span></span> 노출</label>
        <label class="full">상품 ID (쉼표 구분)<input name="ids" id="cids" value="${c.productIds.join(',')}"></label>
        <div class="full"><input type="search" id="cfind" placeholder="상품 검색해서 추가" style="width:100%"><div class="list" id="cres"></div></div>
        <div class="full row"><button class="btn primary">저장</button></div></form>`);
      let t; $('#cfind').oninput = e => { clearTimeout(t); t = setTimeout(async () => {
        const r = await GET('/api/admin/products?limit=8&q=' + encodeURIComponent(e.target.value));
        $('#cres').innerHTML = r.items.map(p => `<div class="li"><img class="pimg" src="${esc(p.image)}" referrerpolicy="no-referrer" alt=""><span style="flex:1">${esc(p.title)}</span><button type="button" class="btn sm" data-add="${p.id}">추가</button></div>`).join('');
        $$('[data-add]').forEach(b => b.onclick = () => { const ids = $('#cids').value.split(',').filter(Boolean); if (!ids.includes(b.dataset.add)) ids.push(b.dataset.add); $('#cids').value = ids.join(','); toast('추가됨'); });
      }, 300); };
      $('#cform').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await POST('/api/admin/curations', { id: c.id, title: f.title, subtitle: f.subtitle, age: f.age || null, active: !!f.active, productIds: f.ids.split(',').map(Number).filter(Boolean) }); toast('저장'); closeDrawer(); VIEWS.curations(v); };
    };
    if (w) {
      $('#cnew').onclick = () => form();
      $$('[data-ced]').forEach(b => b.onclick = () => form(list.find(c => c.id === +b.dataset.ced)));
      $$('[data-cdel]').forEach(b => b.onclick = async () => { if (confirm('삭제할까요?')) { await DEL('/api/admin/curations/' + b.dataset.cdel); VIEWS.curations(v); } });
    }
  };

  VIEWS.collectors = async v => {
    const d = await GET('/api/admin/collectors');
    const w = canW('collectors');
    v.innerHTML = `<div class="grid g3">
        <div class="card"><h3>🔑 API 연결</h3><div class="list">
          <div class="li">네이버 검색 API${d.env.naverApi ? '<span class="sp"></span><span class="tag ok">연결됨</span>' : '<span class="sp"></span><span class="tag warn">키 없음</span>'}</div>
          <div class="li">쿠팡 파트너스 Open API${d.env.coupangApi ? '<span class="sp"></span><span class="tag ok">연결됨</span>' : '<span class="sp"></span><span class="tag warn">최종승인 후</span>'}</div>
          <div class="li">자동 스케줄러<span class="sp"></span>${d.env.scheduler ? '<span class="tag ok">동작</span>' : '<span class="tag">꺼짐</span>'}</div></div>
          <p class="muted" style="font-size:12px">키는 서버 <code>.env</code> 에만 저장합니다 (화면·DB에 저장하지 않음).</p></div>
        <div class="card" style="grid-column:span 2"><h3>🧭 수집 파이프라인</h3>
          <pre style="margin:0;white-space:pre-wrap">① 네이버 데이터랩 → 연령(10~60) x 9분야 인기 키워드 TOP20
② 키워드 → 쿠팡 파트너스 API / 네이버쇼핑 API 상품 매칭 (제휴 링크 자동 생성)
③ 네이버 BEST(연령·성별 많이 본) · 무신사(연령 밴드) · 다이소/올리브영(판매 랭킹) 직접 수집
④ 정규화 → 중복 병합(쇼핑몰+상품ID) → 가격 이력 → 종합 점수(외부순위 35 · 리뷰 20 · 별점 10 · 내부반응 25 · 할인 5 · 신선도 5)
⑤ 1시간마다 점수 재계산, 실패 시 이 화면에 에러 표시</pre></div></div>
      <div class="card"><h3>🤖 수집 잡 ${d.running ? `<span class="tag info">실행 중: ${esc(d.running)}</span>` : ''}</h3><div class="tbl-wrap"><table><thead><tr><th>잡</th><th>상태</th><th>마지막 실행</th><th>주기(분)</th><th>활성</th><th></th></tr></thead><tbody>
      ${d.jobs.map(j => `<tr><td><b>${esc(j.name)}</b><br><span class="muted" style="font-size:12px">${esc(j.description || '')}</span>${j.last_message ? `<br><span style="font-size:12px;color:${j.last_status === 'error' ? 'var(--bad)' : 'var(--ink2)'}">${esc(j.last_message)}</span>` : ''}</td>
        <td>${statusTag(j.last_status, j.enabled)}</td><td class="muted">${ago(j.last_run_at)}</td>
        <td><input type="number" value="${j.interval_min}" data-int="${j.code}" style="width:80px" ${w ? '' : 'disabled'}></td>
        <td><label class="switch"><input type="checkbox" data-en="${j.code}" ${j.enabled ? 'checked' : ''} ${w ? '' : 'disabled'}><span></span></label></td>
        <td>${w ? `<button class="btn sm" data-run="${j.code}">▶ 실행</button> <button class="btn sm" data-cfg="${j.code}">설정</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><h3>📜 실행 이력</h3><div class="tbl-wrap"><table><thead><tr><th>시작</th><th>잡</th><th>상태</th><th class="num">건수</th><th>메시지</th><th>실행자</th></tr></thead><tbody>
      ${d.runs.map(r => `<tr><td class="muted">${esc((r.started_at || '').replace('T', ' ').slice(0, 16))}</td><td>${esc(r.job_code)}</td><td>${statusTag(r.status, 1)}</td><td class="num">${num(r.items)}</td><td style="font-size:12px;max-width:420px">${esc(r.message)}</td><td class="muted">${esc(r.triggered_by)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    if (!w) return;
    $$('[data-run]', v).forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = '실행 중…'; try { const r = await POST(`/api/admin/collectors/${b.dataset.run}/run`); toast(`${r.status}: ${r.message || ''}`); } catch (e) { toast(e.message); } VIEWS.collectors(v); });
    $$('[data-en]', v).forEach(c => c.onchange = async () => { await PATCH('/api/admin/collectors/' + c.dataset.en, { enabled: c.checked }); toast('변경됨'); });
    $$('[data-int]', v).forEach(i => i.onchange = async () => { await PATCH('/api/admin/collectors/' + i.dataset.int, { interval_min: +i.value }); toast('주기 변경됨'); });
    $$('[data-cfg]', v).forEach(b => b.onclick = () => {
      const j = d.jobs.find(x => x.code === b.dataset.cfg);
      openDrawer(`<h2>${esc(j.name)} 설정</h2><p class="muted">JSON. 예: {"maxKeywords":10,"delayMs":6500,"perAgeCat":3,"period":"W","perCategory":15}</p><textarea id="cfgT" rows="10" style="width:100%">${esc(JSON.stringify(JSON.parse(j.config || '{}'), null, 2))}</textarea><div class="row" style="margin-top:12px"><button class="btn primary" id="cfgS">저장</button></div>`);
      $('#cfgS').onclick = async () => { try { await PATCH('/api/admin/collectors/' + j.code, { config: $('#cfgT').value }); toast('저장'); closeDrawer(); } catch (e) { toast(e.message); } };
    });
  };

  VIEWS.revenue = async v => {
    const d = await GET('/api/admin/revenue?' + rq());
    const ch = Object.fromEntries(d.byChannel.map(c => [c.channel, c]));
    const tot = d.byChannel.reduce((s, c) => s + c.commission, 0);
    const months = [...new Set(d.monthly.map(m => m.m))];
    const w = canW('revenue');
    v.innerHTML = `<div class="grid g4 kpis">
        <div class="card kpi accent"><div class="lb">💰 기간 수익 합계</div><div class="v">${won(tot)}</div><span class="d">최근 ${S.days}일</span></div>
        <div class="card kpi"><div class="lb">🛒 쿠팡 파트너스</div><div class="v">${won(ch.coupang?.commission)}</div><span class="d flat">주문 ${num(ch.coupang?.orders)} · 판매액 ${won(ch.coupang?.gmv)}</span></div>
        <div class="card kpi"><div class="lb">📢 AdSense</div><div class="v">${won(ch.adsense?.commission)}</div><span class="d flat">광고 수익</span></div>
        <div class="card kpi"><div class="lb">🏁 쿠팡 최종승인 진행</div><div class="v">${(Math.min(100, d.approval.gmv / d.approval.goal * 100)).toFixed(1)}%</div><div class="prog"><i style="width:${Math.min(100, d.approval.gmv / d.approval.goal * 100)}%"></i></div></div>
      </div>
      <div class="grid g21"><div class="card"><h3>📅 월별 수익</h3><div id="rm"></div></div>
        <div class="card"><h3>🔗 쇼핑몰별 아웃링크 (우리 측 집계)</h3><div id="ro"></div><p class="muted" style="font-size:12px">제휴사 리포트 클릭 수와 비교해 누락·봇 클릭을 점검하세요.</p></div></div>
      <div class="card"><h3>🧾 일별 수익 내역 ${w ? '<button class="btn sm primary" id="radd" style="margin-left:10px">＋ 입력 / CSV 붙여넣기</button>' : ''}</h3><div class="tbl-wrap"><table><thead><tr><th>날짜</th><th>채널</th><th class="num">클릭</th><th class="num">주문</th><th class="num">판매액</th><th class="num">수익</th><th>출처</th><th></th></tr></thead><tbody>
      ${d.rows.slice(0, 120).map(r => `<tr><td>${r.date}</td><td>${esc(r.channel)}</td><td class="num">${num(r.clicks)}</td><td class="num">${num(r.orders)}</td><td class="num">${won(r.gmv)}</td><td class="num"><b>${won(r.commission)}</b></td><td>${r.is_demo ? '<span class="tag warn">데모</span>' : `<span class="tag">${esc(r.imported_from || '')}</span>`}</td><td>${w ? `<button class="btn sm danger" data-rdel="${r.id}">삭제</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    const chans = [...new Set(d.monthly.map(m => m.channel))], col = { coupang: '#E52528', adsense: '#fbbc04' };
    chart.bars($('#rm'), months, chans.map(c => ({ name: c, color: col[c] || '#14b8a6', values: months.map(m => d.monthly.find(x => x.m === m && x.channel === c)?.commission || 0) })), { fmt: won });
    const ob = {}; d.outClicks.forEach(o => { ob[o.source] = (ob[o.source] || 0) + o.n; });
    chart.hbars($('#ro'), Object.entries(ob).map(([k, n]) => ({ label: SRC[k]?.[0] || k, value: n, color: SRC[k]?.[1] })));
    if (!w) return;
    $$('[data-rdel]', v).forEach(b => b.onclick = async () => { await DEL('/api/admin/revenue/' + b.dataset.rdel); VIEWS.revenue(v); });
    $('#radd').onclick = () => {
      openDrawer(`<h2>수익 입력</h2><form class="form" id="rf"><label>날짜<input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label><label>채널<select name="channel"><option value="coupang">쿠팡 파트너스</option><option value="adsense">AdSense</option><option value="naver">네이버 쇼핑커넥트</option><option value="linkprice">링크프라이스</option></select></label>
        <label>클릭<input name="clicks" type="number" value="0"></label><label>주문<input name="orders" type="number" value="0"></label><label>판매액<input name="gmv" type="number" value="0"></label><label>수익<input name="commission" type="number" value="0"></label>
        <div class="full row"><button class="btn primary">저장</button></div></form>
        <h2 style="margin-top:26px">CSV 붙여넣기</h2><p class="muted">형식: <code>date,channel,clicks,orders,gmv,commission</code> (쿠팡 파트너스 리포트 엑셀에서 복사)</p><textarea id="rcsv" rows="8" style="width:100%" placeholder="2026-10-30,coupang,120,4,98000,2940"></textarea><button class="btn primary" id="rcsvS" style="margin-top:10px">가져오기</button>`);
      $('#rf').onsubmit = async e => { e.preventDefault(); await POST('/api/admin/revenue', Object.fromEntries(new FormData(e.target))); toast('저장'); closeDrawer(); VIEWS.revenue(v); };
      $('#rcsvS').onclick = async () => {
        const rows = $('#rcsv').value.trim().split(/\r?\n/).map(l => l.split(/[,\t]/).map(s => s.trim())).filter(c => /^\d{4}-\d{2}-\d{2}$/.test(c[0])).map(([date, channel, clicks, orders, gmv, commission]) => ({ date, channel, clicks, orders, gmv: String(gmv).replace(/[^0-9]/g, ''), commission: String(commission).replace(/[^0-9]/g, ''), imported_from: 'csv' }));
        const r = await POST('/api/admin/revenue', { rows }); toast(`${r.n}행 반영`); closeDrawer(); VIEWS.revenue(v);
      };
    };
  };

  VIEWS.ads = async v => {
    const d = await GET('/api/admin/ads?' + rq());
    const w = canW('ads'), st = Object.fromEntries(d.stats.map(s => [s.slot, s]));
    const rev = d.adsenseRevenue.reduce((s, r) => s + r.commission, 0), impr = d.stats.reduce((s, x) => s + x.impressions, 0);
    v.innerHTML = `<div class="grid g4 kpis">
        <div class="card kpi"><div class="lb">AdSense 상태</div><div class="v" style="font-size:20px">${d.enabled && d.client ? '<span class="tag ok" style="font-size:14px">게재 중</span>' : '<span class="tag warn" style="font-size:14px">미설정</span>'}</div><span class="muted">${esc(d.client || '게시자 ID 없음')}</span></div>
        <div class="card kpi"><div class="lb">광고 노출 (자체 집계)</div><div class="v">${num(impr)}</div></div>
        <div class="card kpi"><div class="lb">광고 수익</div><div class="v">${won(rev)}</div></div>
        <div class="card kpi"><div class="lb">페이지 RPM (추정)</div><div class="v">${won(impr ? rev / impr * 1000 : 0)}</div></div></div>
      <div class="card"><h3>📢 AdSense 연결</h3><form class="form" id="adf"><label>게시자 ID (ca-pub-...)<input name="adsense_client" value="${esc(d.client)}" placeholder="ca-pub-0000000000000000" ${w ? '' : 'disabled'}></label>
        <label class="row" style="flex-direction:row;align-items:center;margin-top:20px"><span class="switch"><input type="checkbox" name="adsense_enabled" ${d.enabled ? 'checked' : ''} ${w ? '' : 'disabled'}><span></span></span> 광고 게재</label>
        ${w ? '<div class="full row"><button class="btn primary">저장</button><a class="btn" href="/ads.txt" target="_blank">ads.txt 확인 ↗</a></div>' : ''}</form>
        <p class="muted" style="font-size:12px">게시자 ID를 저장하면 <code>/ads.txt</code> 가 자동 생성되고, 모든 페이지에 AdSense 스크립트가 삽입됩니다. 쿠팡 파트너스 고지 문구는 광고와 별도로 상시 노출됩니다.</p></div>
      <div class="card"><h3>🧩 광고 슬롯</h3><div class="tbl-wrap"><table><thead><tr><th>슬롯</th><th>위치</th><th>형식</th><th>AdSense 광고 단위 ID</th><th>N개마다</th><th class="num">노출</th><th class="num">클릭</th><th>활성</th><th></th></tr></thead><tbody>
      ${d.slots.map(s => `<tr data-slot="${s.code}"><td><b>${esc(s.name)}</b><br><code>${s.code}</code></td><td>${esc(s.placement)}</td><td><select data-k="format" ${w ? '' : 'disabled'}>${['auto', 'horizontal', 'rectangle', 'fluid'].map(f => `<option ${s.format === f ? 'selected' : ''}>${f}</option>`).join('')}</select></td>
        <td><input data-k="adsense_slot" value="${esc(s.adsense_slot)}" placeholder="1234567890" style="width:130px" ${w ? '' : 'disabled'}></td><td><input data-k="every_n" type="number" value="${s.every_n}" style="width:64px" ${w ? '' : 'disabled'}></td>
        <td class="num">${num(st[s.code]?.impressions)}</td><td class="num">${num(st[s.code]?.clicks)}</td><td><label class="switch"><input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''} ${w ? '' : 'disabled'}><span></span></label></td><td>${w ? '<button class="btn sm" data-save>저장</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div></div>
      `;
    
    if (!w) return;
    $('#adf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); try { await PUT('/api/admin/settings', { adsense_client: f.get('adsense_client'), adsense_enabled: !!f.get('adsense_enabled') }); toast('저장'); } catch (er) { toast(er.message); } };
    $$('[data-save]', v).forEach(b => b.onclick = async () => {
      const tr = b.closest('tr'), s = d.slots.find(x => x.code === tr.dataset.slot), g = k => $(`[data-k="${k}"]`, tr);
      await PUT('/api/admin/ads/' + s.code, { ...s, format: g('format').value, adsense_slot: g('adsense_slot').value, every_n: +g('every_n').value, enabled: g('enabled').checked }); toast('슬롯 저장');
    });
  };

  VIEWS.org = async v => {
    const d = await GET('/api/admin/org');
    const w = S.me.perms.includes('*');
    const ts = {}; d.taskStats.forEach(t => { (ts[t.department] ||= {})[t.status] = t.n; });
    const roleL = Object.fromEntries(d.roles.map(r => [r.code, r.label]));
    const allPerms = ['dashboard', 'analytics', 'products', 'keywords', 'curations', 'collectors', 'revenue', 'ads', 'tasks', 'settings', 'logs', 'export'];
    v.innerHTML = `<div class="card"><h3>🏢 조직도</h3><div class="orgchart"><div class="oc-top">대표 (PO · 경영총괄)</div><div class="oc-line"></div>
        <div class="oc-row">${d.departments.filter(x => x.code !== 'exec').map(x => `<div class="oc-node" style="--c:${x.color}">${esc(x.name)}<small>${d.staff.filter(s => s.department === x.code).length}명 · 업무 ${Object.values(ts[x.code] || {}).reduce((a, b) => a + b, 0)}</small></div>`).join('')}</div></div></div>
      <div class="grid g4">${d.departments.map(x => `<div class="card dept" style="--c:${x.color}"><h3>${esc(x.name)}</h3><p style="margin:0 0 8px;font-size:13px">${esc(x.mission)}</p><p class="muted" style="font-size:12px;margin:0 0 10px">KPI: ${esc(x.kpi)}</p>
        ${d.staff.filter(s => s.department === x.code).map(s => `<div class="mem ${s.active ? '' : 'off'}"><span class="av">${esc(s.name.slice(0, 1))}</span><span style="flex:1">${esc(s.title || s.name)}<br><span class="muted" style="font-size:11px">${esc(roleL[s.role])}${s.active ? '' : ' · 채용 예정(TO)'}</span></span></div>`).join('')}
        <div class="row" style="margin-top:8px">${Object.entries(STATUS).map(([k, n]) => `<span class="tag">${n} ${ts[x.code]?.[k] || 0}</span>`).join('')}</div></div>`).join('')}</div>
      <div class="card"><h3>👤 직원 계정 ${w ? '<button class="btn sm primary" id="snew" style="margin-left:10px">＋ 계정 발급</button>' : ''}<span class="sub">비활성 계정 = 채용 예정 TO (로그인 불가)</span></h3><div class="tbl-wrap"><table><thead><tr><th>이름</th><th>이메일</th><th>부서</th><th>직무</th><th>역할(권한)</th><th>최근 로그인</th><th>활성</th><th></th></tr></thead><tbody>
      ${d.staff.map(s => `<tr data-sid="${s.id}"><td><b>${esc(s.name)}</b></td><td class="muted">${esc(s.email)}</td><td>${esc(d.departments.find(x => x.code === s.department)?.name || '-')}</td><td>${esc(s.title || '')}</td>
        <td>${w && s.role !== 'owner' ? `<select data-role>${d.roles.filter(r => r.code !== 'owner').map(r => `<option value="${r.code}" ${s.role === r.code ? 'selected' : ''}>${r.label}</option>`).join('')}</select>` : `<span class="tag">${esc(roleL[s.role])}</span>`}</td>
        <td class="muted">${ago(s.last_login_at)}</td><td><label class="switch"><input type="checkbox" data-act ${s.active ? 'checked' : ''} ${w && s.role !== 'owner' ? '' : 'disabled'}><span></span></label></td><td>${w && s.role !== 'owner' ? '<button class="btn sm" data-reset>비번 재발급</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><h3>🔐 역할별 권한 매트릭스</h3><div class="tbl-wrap"><table class="perm"><thead><tr><th>역할</th>${allPerms.map(p => `<th>${p}</th>`).join('')}</tr></thead><tbody>
      ${d.roles.map(r => `<tr><td>${esc(r.label)}</td>${allPerms.map(p => { const all = r.perms.includes('*'); const wr = all || r.perms.includes(p + '.write'); const rd = wr || r.perms.includes(p); return `<td>${wr ? '✏️' : rd ? '👁️' : '·'}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div><p class="muted" style="font-size:12px">✏️ 읽기+쓰기 · 👁️ 읽기 · 직원 계정 발급/권한 변경은 대표·총괄 관리자만 가능</p></div>`;
    if (!w) return;
    $('#snew').onclick = () => {
      openDrawer(`<h2>직원 계정 발급</h2><form class="form" id="sf"><label>이름<input name="name" required></label><label>이메일<input name="email" type="email" required></label>
        <label>부서<select name="department">${d.departments.map(x => `<option value="${x.code}">${esc(x.name)}</option>`).join('')}</select></label><label>직무<input name="title" placeholder="예: 연령별 큐레이터"></label>
        <label class="full">역할<select name="role">${d.roles.filter(r => r.code !== 'owner').map(r => `<option value="${r.code}">${r.label}</option>`).join('')}</select></label><div class="full row"><button class="btn primary">발급</button></div></form><div id="sres"></div>`);
      $('#sf').onsubmit = async e => { e.preventDefault(); try { const r = await POST('/api/admin/staff', Object.fromEntries(new FormData(e.target))); $('#sres').innerHTML = `<div class="card" style="margin-top:16px"><b>임시 비밀번호</b> (한 번만 표시): <code>${esc(r.tempPassword)}</code><p class="muted">첫 로그인 시 변경하도록 안내하세요.</p></div>`; VIEWS.org(v); } catch (er) { toast(er.message); } };
    };
    $$('tr[data-sid]', v).forEach(tr => {
      const id = tr.dataset.sid;
      $('[data-role]', tr) && ($('[data-role]', tr).onchange = async e => { await PATCH('/api/admin/staff/' + id, { role: e.target.value }); toast('권한 변경'); });
      $('[data-act]', tr).onchange = async e => { await PATCH('/api/admin/staff/' + id, { active: e.target.checked }); toast(e.target.checked ? '활성화 (비번 재발급 필요)' : '비활성화'); };
      $('[data-reset]', tr) && ($('[data-reset]', tr).onclick = async () => { const r = await PATCH('/api/admin/staff/' + id, { resetPassword: true }); openDrawer(`<h2>임시 비밀번호</h2><p>한 번만 표시됩니다: <code>${esc(r.tempPassword)}</code></p>`); });
    });
  };

  // ---------- 피드백 (2026-11-03: 사장님 ↔ AI) ----------
  //  업무별: task.comments = [{at, by:'owner'|'ai', msg, done}]  (사장님 글은 AI가 반영하면 done=true)
  //  전체:   admin/main/feedback 컬렉션 {msg, by, at, done, reply, reply_at}
  const fbTime = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const fbOpen = t => (t.comments || []).filter(c => c.by === 'owner' && !c.done).length;
  const fbThread = list => (list || []).length ? `<ul class="fbt">${list.map(c => `<li class="${c.by === 'ai' ? 'ai' : 'me'}"><b>${c.by === 'ai' ? '🤖 AI' : '🙋 사장님'}</b> <span class="muted">${esc(fbTime(c.at))}${c.by === 'owner' ? (c.done ? ' · 반영됨' : ' · 반영 대기') : ''}</span><p>${esc(c.msg)}</p></li>`).join('')}</ul>` : '<p class="muted" style="font-size:12px;margin:6px 0">아직 피드백이 없어요.</p>';
  // ---------- 업무 보드 (2026-11-02: AI 운영 연동 / 2026-11-03: 피드백) ----------
  //  필드: title, body, department, priority, status, start_date, due_date, assignee_id
  //        ai_do(사장님이 AI에게 지시), ai_rec(AI 추천 업무), ai_state(queued|working|needs_input|done), ai_note(AI 최근 메모),
  //        ai_log([{at,msg}]), related([id]), parent_id, triaged_at(AI가 부서·기간 정리한 시각), created_by(owner|ai),
  //        comments([{at, by:'owner'|'ai', msg, done}]) ← 사장님 피드백과 AI 답변
  const AIST = { queued: ['🤖 대기', 'info'], working: ['🤖 AI 진행중', 'warn'], needs_input: ['🙋 확인 필요', 'bad'], done: ['🤖 AI 완료', 'ok'] };
  const PRANK = { urgent: 0, high: 1, normal: 2, low: 3 };
  VIEWS.tasks = async v => {
    const [list, org, gfb] = await Promise.all([GET('/api/admin/tasks'), GET('/api/admin/org'), GET('/api/admin/feedback').catch(() => [])]);
    const w = canW('tasks');
    const byId = Object.fromEntries(list.map(t => [String(t.id), t]));
    const card = t => {
      const ai = AIST[t.ai_state];
      const rel = (t.related || []).filter(id => byId[id]);
      const body = t.body || '', note = t.ai_note || '';
      const fo = fbOpen(t), fn = (t.comments || []).length;
      return `<div class="tk${t.ai_rec ? ' airec' : ''}" draggable="${w}" data-tid="${t.id}" data-dept="${t.department || ''}" style="--c:${t.color || 'var(--line)'}">
        ${t.ai_rec ? '<span class="tag ai">🤖 AI 추천</span>' : ''}<b>${esc(t.title)}</b>
        <div class="row"><span class="tag ${PRIO[t.priority]?.[1] || ''}">${PRIO[t.priority]?.[0] || '보통'}</span><span class="tag">${esc(t.dept || '부서 미정')}</span>${t.assignee ? `<span class="tag info">${esc(t.assignee)}</span>` : ''}${t.start_date || t.due_date ? `<span class="tag">📅 ${esc(t.start_date || '')}~${esc(t.due_date || '')}</span>` : ''}${ai ? `<span class="tag ${ai[1]}">${ai[0]}</span>` : ''}${rel.length ? `<span class="tag" title="${esc(rel.map(id => byId[id].title).join(' / '))}">🔗 연관 ${rel.length}</span>` : ''}${fo ? `<span class="tag warn">💬 피드백 반영 대기 ${fo}</span>` : fn ? `<span class="tag">💬 ${fn}</span>` : ''}${!t.triaged_at && t.status !== 'done' && t.status !== 'hold' ? '<span class="tag">⏳ AI 정리 대기</span>' : ''}</div>
        ${body ? `<p>${esc(body.length > 140 ? body.slice(0, 140) + '…' : body)}</p>` : ''}
        ${note ? `<p class="ainote">🤖 ${esc(note.length > 160 ? note.slice(0, 160) + '…' : note)}</p>` : ''}
        <div class="tk-act">${w && t.status !== 'done' ? `<label class="aido" title="체크하면 AI가 다음 확인 시간에 이 업무를 진행해요"><input type="checkbox" data-aido="${t.id}" ${t.ai_do ? 'checked' : ''}> 🤖 AI에게 맡기기</label>` : '<span></span>'}${w ? `<button type="button" class="btn sm fbbtn" data-fb="${t.id}">💬 피드백</button>` : ''}</div>
      </div>`;
    };
    const gOpen = gfb.filter(f => f.by === 'owner' && !f.done).length;
    const holdL = list.filter(t => t.status === 'hold').sort((a, b) => (PRANK[a.priority] ?? 2) - (PRANK[b.priority] ?? 2));
    v.innerHTML = `<div class="card"><div class="toolbar"><select id="tdept"><option value="">전체 부서</option>${org.departments.map(x => `<option value="${x.code}">${esc(x.name)}</option>`).join('')}</select>
      <select id="tai"><option value="">전체 업무</option><option value="rec">🤖 AI 추천만</option><option value="do">🤖 AI에게 맡긴 것</option><option value="need">🙋 확인 필요</option><option value="fb">💬 피드백 반영 대기</option></select>
      <span class="sp"></span>${w ? `<button class="btn" id="gfbBtn">💬 AI에게 전체 피드백${gOpen ? ` <span class="tag warn">${gOpen}</span>` : ''}</button><button class="btn primary" id="tnew">＋ 업무 추가</button>` : ''}</div>
      <p class="muted" style="font-size:12px;margin:8px 2px 0">업무를 추가해두면 AI가 확인 시간(매일 12:40 · 16:40 · 21:40)에 부서·기간·우선순위·연관 업무를 정리해요. <b>🤖 AI에게 맡기기</b>를 체크하면 다음 확인 시간에 AI가 진행해요. 카드의 <b>💬 피드백</b>에 적어두시면 AI가 다음 확인 때 읽고 반영한 뒤 답을 달아요. <b>🤖 AI 추천</b>은 AI가 제안한 업무예요. 당장 안 할 업무는 아래 <b>⏸ 보류</b>로 끌어다 두면 할 일 목록에서 빠져요. (AI 확인은 사장님 PC의 Aside가 켜져 있을 때만 돌아요)</p></div>
      <div class="kanban">${Object.entries(STATUS).filter(([k]) => k !== 'hold').map(([k, n]) => `<div class="col" data-col="${k}"><h4>${n}<span class="muted">${list.filter(t => t.status === k).length}</span></h4>${list.filter(t => t.status === k).sort((a, b) => (PRANK[a.priority] ?? 2) - (PRANK[b.priority] ?? 2)).map(card).join('')}</div>`).join('')}</div>
      <details class="col holdbox" data-col="hold" ${localStorage.getItem('tp_hold_open') === '1' ? 'open' : ''}><summary>⏸ 보류 <span class="tag">${holdL.length}</span><span class="muted">당장은 안 하지만 나중에 다시 볼 업무예요. 카드를 여기로 끌어다 놓으면 보류돼요 (눌러서 펼치기).</span></summary><div class="holdgrid">${holdL.map(card).join('') || '<p class="muted" style="font-size:12px;margin:0">보류된 업무가 없어요.</p>'}</div></details>`;
    const hb = $('.holdbox', v); if (hb) hb.ontoggle = () => localStorage.setItem('tp_hold_open', hb.open ? '1' : '0');
    const applyFilter = () => { const dp = $('#tdept').value, ai = $('#tai').value; $$('.tk', v).forEach(el => { const t = byId[el.dataset.tid]; el.hidden = !!((dp && el.dataset.dept !== dp) || (ai === 'rec' && !t.ai_rec) || (ai === 'do' && !t.ai_do) || (ai === 'need' && t.ai_state !== 'needs_input') || (ai === 'fb' && !fbOpen(t))); }); };
    $('#tdept').onchange = applyFilter; $('#tai').onchange = applyFilter;
    if (!w) return;
    $$('input[data-aido]', v).forEach(cb => {
      cb.onclick = e => e.stopPropagation();
      cb.onchange = async e => { const on = e.target.checked; await PATCH('/api/admin/tasks/' + e.target.dataset.aido, on ? { ai_do: true, ai_state: 'queued' } : { ai_do: false, ai_state: '' }); toast(on ? '🤖 AI에게 맡겼어요 (다음 확인 시간에 진행)' : 'AI 지시 취소'); VIEWS.tasks(v); };
    });
    $$('[data-fb]', v).forEach(b => { b.onclick = e => { e.stopPropagation(); taskForm(byId[b.dataset.fb], true); }; });
    let drag = null;
    $$('.tk', v).forEach(t => { t.ondragstart = () => { drag = t; t.classList.add('dragging'); }; t.ondragend = () => t.classList.remove('dragging'); t.ondblclick = () => taskForm(byId[t.dataset.tid]); });
    $$('.col', v).forEach(c => {
      c.ondragover = e => { e.preventDefault(); c.classList.add('over'); };
      c.ondragleave = () => c.classList.remove('over');
      c.ondrop = async e => { e.preventDefault(); c.classList.remove('over'); if (!drag) return; c.appendChild(drag); await PATCH('/api/admin/tasks/' + drag.dataset.tid, { status: c.dataset.col }); toast(`→ ${STATUS[c.dataset.col]}`); VIEWS.tasks(v); };
    });
    // 전체 피드백 (특정 업무가 아닌 운영 전반)
    $('#gfbBtn').onclick = () => {
      openDrawer(`<h2>💬 AI에게 전체 피드백</h2><p class="muted" style="font-size:13px">업무 하나가 아니라 운영 전반에 대한 의견·지시를 남겨주세요. AI가 다음 확인 시간에 읽고 반영한 뒤 답을 달아요.</p>
        <form class="form" id="gff"><label class="full">내용<textarea name="msg" rows="4" required placeholder="예: 앞으로 블로그 글은 저녁 8시에 올리는 걸로 맞춰줘"></textarea></label><div class="full row"><button class="btn primary">남기기</button></div></form>
        <div class="fbg">${gfb.length ? gfb.slice(0, 40).map(f => `<div class="fbg-i"><div><b>🙋 사장님</b> <span class="muted">${esc(fbTime(f.at))} · ${f.done ? '반영됨' : '반영 대기'}</span></div><p>${esc(f.msg)}</p>${f.reply ? `<div class="fbg-r"><b>🤖 AI</b> <span class="muted">${esc(fbTime(f.reply_at))}</span><p>${esc(f.reply)}</p></div>` : ''}</div>`).join('') : '<p class="muted">아직 남긴 피드백이 없어요.</p>'}</div>`);
      $('#gff').onsubmit = async e => { e.preventDefault(); const msg = new FormData(e.target).get('msg').trim(); if (!msg) return; await POST('/api/admin/feedback', { msg }); toast('💬 남겼어요 (다음 확인 시간에 반영)'); closeDrawer(); VIEWS.tasks(v); };
    };
    const taskForm = (t, focusFb) => {
      t = t || { title: '', body: '', department: '', priority: 'normal', status: 'todo' };
      const rel = (t.related || []).filter(id => byId[id]);
      const log = (t.ai_log || []).slice(-12).reverse();
      openDrawer(`<h2>${t.id ? '업무 편집' : '업무 추가'}${t.ai_rec ? ' <span class="tag ai">🤖 AI 추천</span>' : ''}</h2>
        ${t.id ? `<div class="fbbox" id="fbbox"><b style="font-size:13px">💬 피드백</b> <span class="muted" style="font-size:12px">적어두시면 AI가 다음 확인 때 읽고 반영한 뒤 답을 달아요</span>${fbThread(t.comments)}
          <form id="fbf" class="fbf"><textarea name="msg" rows="3" required placeholder="AI에게 이 업무에 대한 피드백·지시를 남겨주세요"></textarea><button class="btn primary">💬 남기기</button></form></div>` : ''}
        <form class="form" id="tf"><label class="full">제목<input name="title" value="${esc(t.title)}" required></label>
        <label>부서<select name="department"><option value="">AI가 정해줘</option>${org.departments.map(x => `<option value="${x.code}" ${t.department === x.code ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label>담당자<select name="assignee_id"><option value="">미지정</option>${org.staff.filter(s => s.active).map(s => `<option value="${s.id}" ${t.assignee_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label>우선순위<select name="priority">${Object.entries(PRIO).map(([k, [n]]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>상태<select name="status">${Object.entries(STATUS).map(([k, n]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>시작일<input type="date" name="start_date" value="${esc(t.start_date || '')}"></label>
        <label>마감일<input type="date" name="due_date" value="${esc(t.due_date || '')}"></label>
        <label class="full">내용<textarea name="body" rows="5" placeholder="대충 적어두면 AI가 부서·기간·우선순위를 정리해요">${esc(t.body || '')}</textarea></label>
        <label class="full aido"><input type="checkbox" name="ai_do" ${t.ai_do ? 'checked' : ''}> 🤖 AI에게 맡기기 (다음 확인 시간에 AI가 진행)</label>
        ${rel.length ? `<div class="full"><b style="font-size:12px">🔗 연관 업무</b><ul style="margin:4px 0 0;padding-left:18px;font-size:12px">${rel.map(id => `<li>${esc(byId[id].title)} <span class="muted">(${STATUS[byId[id].status] || ''})</span></li>`).join('')}</ul></div>` : ''}
        ${t.ai_note || log.length ? `<div class="full ailog"><b style="font-size:12px">🤖 AI 메모</b>${t.ai_note ? `<p>${esc(t.ai_note)}</p>` : ''}${log.length ? `<ul>${log.map(x => `<li><span class="muted">${esc(fbTime(x.at))}</span> ${esc(x.msg)}</li>`).join('')}</ul>` : ''}</div>` : ''}
        <div class="full row"><button class="btn primary">저장</button><button type="button" class="btn" data-close>닫기</button>${t.id ? '<button type="button" class="btn danger" id="tdel">삭제</button>' : ''}</div></form>`);
      if (focusFb && $('#fbbox')) { $('#fbbox').scrollIntoView({ block: 'start' }); $('#fbf textarea').focus(); }
      $('#fbf') && ($('#fbf').onsubmit = async e => {
        e.preventDefault(); const msg = new FormData(e.target).get('msg').trim(); if (!msg) return;
        await PATCH('/api/admin/tasks/' + t.id, { comments: [...(t.comments || []), { at: new Date().toISOString(), by: 'owner', msg, done: false }] });
        toast('💬 피드백 남겼어요 (다음 확인 시간에 AI가 반영)'); closeDrawer(); VIEWS.tasks(v);
      });
      $('#tf').onsubmit = async e => {
        e.preventDefault(); const fd = new FormData(e.target); const f = Object.fromEntries(fd);
        f.assignee_id = f.assignee_id ? +f.assignee_id : null; f.ai_do = fd.has('ai_do');
        if (f.ai_do && !t.ai_do) f.ai_state = 'queued';
        if (!f.ai_do && t.ai_do && t.ai_state === 'queued') f.ai_state = '';
        if (!t.id) f.created_by = 'owner';
        t.id ? await PATCH('/api/admin/tasks/' + t.id, f) : await POST('/api/admin/tasks', f); closeDrawer(); VIEWS.tasks(v);
      };
      $('#tdel') && ($('#tdel').onclick = async () => { if (!confirm('이 업무를 삭제할까요?')) return; await DEL('/api/admin/tasks/' + t.id); closeDrawer(); VIEWS.tasks(v); });
    };
    $('#tnew').onclick = () => taskForm();
  };

  VIEWS.settings = async v => {
    const d = await GET('/api/admin/settings');
    const s = d.settings;
    const L = { site_name: '사이트 이름', site_tagline: '슬로건', site_url: '사이트 URL (sitemap/OG)', disclosure: '제휴 고지 문구 (필수)', price_notice: '가격 안내 문구', coupang_sub_id: '쿠팡 파트너스 subId', contact_email: '문의 이메일', ga_measurement_id: 'GA4 측정 ID' };
    v.innerHTML = `<div class="grid g21"><div class="card"><h3>⚙️ 사이트 설정</h3><form class="form" id="sf">${Object.entries(L).map(([k, l]) => `<label class="${['disclosure', 'price_notice'].includes(k) ? 'full' : ''}">${l}<input name="${k}" value="${esc(s[k])}"></label>`).join('')}
        <label class="row" style="flex-direction:row;align-items:center"><span class="switch"><input type="checkbox" name="maintenance" ${s.maintenance ? 'checked' : ''}><span></span></span> 점검 모드 (공개 페이지 503)</label>
        <div class="full row"><button class="btn primary">저장</button></div></form></div>
      <div class="card"><h3>🖥️ 시스템</h3><div class="list">${Object.entries(d.system).map(([k, val]) => `<div class="li">${k}<span class="sp"></span><code>${esc(String(val))}</code></div>`).join('')}</div>
        <h3 style="margin-top:20px">🧪 데모 데이터</h3><p class="muted" style="font-size:13px">대시보드 시연용 가상 트래픽/수익 데이터를 삭제합니다. 실제 운영 데이터는 유지됩니다.</p><button class="btn danger" id="purge">데모 데이터 삭제</button>
        <h3 style="margin-top:20px">🔑 내 비밀번호 변경</h3><form class="form" id="pwf"><label class="full">현재 비밀번호<input type="password" name="current" required></label><label class="full">새 비밀번호 (10자 이상)<input type="password" name="next" required minlength="10"></label><div class="full"><button class="btn">변경</button></div></form></div></div>`;
    if (STATIC && STATIC.__fb) { $$('#sf input, #sf button, #purge, #pwf input, #pwf button', v).forEach(x => { x.disabled = true; x.title = '정적 사이트에서는 지원하지 않는 기능이에요'; }); } $('#sf').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.maintenance = !!f.maintenance; try { await PUT('/api/admin/settings', f); toast('저장했습니다'); } catch (er) { toast(er.message); } };
    $('#purge').onclick = async () => { if (!confirm('데모 데이터를 모두 삭제할까요?')) return; const r = await POST('/api/admin/demo/purge'); toast(`이벤트 ${num(r.events)} · 수익 ${num(r.revenue)}건 삭제`); };
    $('#pwf').onsubmit = async e => { e.preventDefault(); try { await POST('/api/admin/password', Object.fromEntries(new FormData(e.target))); toast('비밀번호 변경됨'); e.target.reset(); } catch (er) { toast(er.message); } };
  };

  // ---------- 감사 로그 (2026-11-03: 한눈에 보기 + 클릭하면 상세) ----------
  const LOG_ACT = {
    task_create: '업무 추가', task_update: '업무 수정', task_delete: '업무 삭제',
    ai_task_create: 'AI 추천 업무 추가', ai_task_update: 'AI 업무 정리', ai_task_note: 'AI 메모', ai_task_comment: 'AI 답변',
    feedback_create: '전체 피드백', feedback_update: '피드백 처리', revenue_upsert: '수익 입력', revenue_delete: '수익 삭제',
    login: '로그인', logout: '로그아웃',
  };
  const LOG_FIELD = { title: '제목', body: '내용', department: '부서', status: '상태', priority: '우선순위', start_date: '시작일', due_date: '마감일', assignee_id: '담당자', ai_do: 'AI에게 맡기기', ai_rec: 'AI 추천', ai_state: 'AI 상태', ai_note: 'AI 메모', ai_log: 'AI 기록', related: '연관 업무', parent_id: '상위 업무', triaged_at: 'AI 정리', created_by: '작성', comments: '피드백', msg: '내용', done: '반영', reply: 'AI 답변' };
  const LOG_SKIP = ['updated_at', 'created_at', 'ai_log'];
  const logParse = s => { if (s && typeof s === 'object') return s; try { const j = JSON.parse(s); return j && typeof j === 'object' ? j : null; } catch { return null; } };
  const logVal = (k, v, deptName) => {
    if (v === true) return '켬'; if (v === false) return '끔'; if (v === '' || v == null) return '비움';
    if (k === 'status') return STATUS[v] || v; if (k === 'priority') return PRIO[v]?.[0] || v; if (k === 'department') return deptName(v);
    if (k === 'ai_state') return (AIST[v] || [v])[0];
    if (k === 'related') return Array.isArray(v) ? `${v.length}개` : v;
    if (k === 'comments') return Array.isArray(v) ? `${v.length}개 (마지막: ${String(v[v.length - 1]?.msg || '').slice(0, 30)})` : v;
    if (k === 'triaged_at') return '완료';
    const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 40 ? s.slice(0, 40) + '…' : s;
  };
  VIEWS.logs = async v => {
    const [list, tasks, org] = await Promise.all([GET('/api/admin/logs?limit=200'), GET('/api/admin/tasks').catch(() => []), GET('/api/admin/org').catch(() => ({ departments: [] }))]);
    const tname = Object.fromEntries(tasks.map(t => [String(t.id), t.title]));
    const dname = c => (org.departments || []).find(d => d.code === c)?.name || c;
    const who = l => String(l.action || '').startsWith('ai_') ? '🤖 AI' : esc(l.name || '-');
    const summary = l => {
      const d = logParse(l.detail);
      if (!d) return esc(String(l.detail || '').slice(0, 90)) + (String(l.detail || '').length > 90 ? '…' : '');
      const ks = Object.keys(d).filter(k => !LOG_SKIP.includes(k));
      if (!ks.length) return '<span class="muted">세부 변경 없음</span>';
      return ks.slice(0, 4).map(k => `<span class="lg-kv"><b>${esc(LOG_FIELD[k] || k)}</b> ${esc(logVal(k, d[k], dname))}</span>`).join(' ') + (ks.length > 4 ? ` <span class="muted">외 ${ks.length - 4}개</span>` : '');
    };
    v.innerHTML = `<div class="card"><h3>📜 감사 로그 <span class="sub">누가 · 언제 · 무엇을 · 행을 누르면 상세</span></h3><div class="tbl-wrap"><table class="logtbl"><thead><tr><th>시간</th><th>누가</th><th>무엇을</th><th>대상</th><th>내용</th></tr></thead><tbody>
      ${list.map((l, i) => `<tr data-li="${i}" class="clk"><td class="muted" style="white-space:nowrap">${esc(fbTime(l.created_at))}</td><td style="white-space:nowrap">${who(l)}</td><td><span class="tag">${esc(LOG_ACT[l.action] || l.action)}</span></td><td style="max-width:220px">${esc(tname[l.target] || l.target || '-')}</td><td style="font-size:12px;max-width:420px">${summary(l)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">기록 없음</td></tr>'}
      </tbody></table></div></div>`;
    $$('tr[data-li]', v).forEach(tr => tr.onclick = () => {
      const l = list[+tr.dataset.li], d = logParse(l.detail);
      const rows = d ? Object.entries(d).filter(([k]) => k !== 'ai_log').map(([k, val]) => `<tr><th>${esc(LOG_FIELD[k] || k)}</th><td>${k === 'comments' && Array.isArray(val) ? val.map(c => `<div>${c.by === 'ai' ? '🤖' : '🙋'} ${esc(c.msg)}</div>`).join('') : esc(typeof val === 'string' ? (['status', 'priority', 'department', 'ai_state'].includes(k) ? logVal(k, val, dname) : val) : typeof val === 'boolean' ? (val ? '켬' : '끔') : JSON.stringify(val))}</td></tr>`).join('') : `<tr><th>내용</th><td>${esc(l.detail || '')}</td></tr>`;
      openDrawer(`<h2>📜 ${esc(LOG_ACT[l.action] || l.action)}</h2>
        <table class="kv"><tr><th>시간</th><td>${esc(fbTime(l.created_at))} <span class="muted">(${esc(l.created_at || '')})</span></td></tr><tr><th>누가</th><td>${who(l)}${String(l.action || '').startsWith('ai_') ? ` <span class="muted">(${esc(l.name || '')} 계정으로 실행)</span>` : ''}</td></tr><tr><th>대상</th><td>${esc(tname[l.target] || '')} <span class="muted">${esc(l.target || '')}</span></td></tr>${l.ip ? `<tr><th>IP</th><td>${esc(l.ip)}</td></tr>` : ''}</table>
        <h3 style="margin:16px 0 8px;font-size:14px">상세</h3><table class="kv">${rows}</table>
        ${d ? `<details style="margin-top:12px"><summary class="muted" style="cursor:pointer;font-size:12px">원본 데이터(JSON) 보기</summary><pre class="rawjson">${esc(JSON.stringify(d, null, 2))}</pre></details>` : ''}
        <div class="row" style="margin-top:16px"><button class="btn" data-close>닫기</button></div>`);
    });
  };

  // ---------- 공통 ----------
  const srcTag = s => `<span class="tag" style="background:${(SRC[s] || [, '#888'])[1]}1f;color:${(SRC[s] || [, '#888'])[1]}">${(SRC[s] || [s])[0]}</span>`;
  const statusTag = (s, en) => !en ? '<span class="tag">꺼짐</span>' : s === 'success' ? '<span class="tag ok">정상</span>' : s === 'error' ? '<span class="tag bad">오류</span>' : s === 'running' ? '<span class="tag info">실행중</span>' : '<span class="tag">대기</span>';
  function ago(t) {
    if (!t) return '-';
    const d = new Date(String(t).includes('T') ? t : t.replace(' ', 'T') + 'Z'), m = (Date.now() - d) / 60e3;
    return m < 1 ? '방금' : m < 60 ? `${Math.round(m)}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
  }
  // 모바일 개선 (2026-11-03): 팝업에 ✕ 닫기 버튼, 뒤로가기로 닫기
  function openDrawer(html) { $('#drawerPanel').innerHTML = '<button type="button" class="dr-x" data-close aria-label="닫기">✕</button>' + html; if ($('#drawer').hidden) { $('#drawer').hidden = false; try { history.pushState({ tpDrawer: 1 }, ''); } catch {} } }
  function closeDrawer() { if ($('#drawer').hidden) return; $('#drawer').hidden = true; if (history.state && history.state.tpDrawer) history.back(); }
  addEventListener('popstate', () => { if (!$('#drawer').hidden) $('#drawer').hidden = true; setSide(false); });
  $('#drawer').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  $('#rangeSeg').onclick = e => { const b = e.target.closest('[data-days]'); if (!b) return; S.days = +b.dataset.days; $$('#rangeSeg button').forEach(x => x.classList.toggle('on', x === b)); route(); };
  $('#demoToggle').onchange = e => { S.demo = e.target.checked; route(); };
  // 데모 포함 끔 (2026-11-02): 체크 해제 + 토글 숨김
  (() => { const dt = $('#demoToggle'); if (dt) { dt.checked = false; const lb = dt.closest('label'); if (lb) lb.hidden = true; else dt.hidden = true; } })();
  // 모바일 메뉴 (2026-11-03): ✕ 닫기 버튼 + 바깥 누르면 닫힘 + 메뉴 고르면 닫힘
  const sideBg = document.createElement('div'); sideBg.className = 'side-bg'; document.body.appendChild(sideBg);
  const sideX = document.createElement('button'); sideX.type = 'button'; sideX.className = 'side-x'; sideX.setAttribute('aria-label', '메뉴 닫기'); sideX.textContent = '✕'; $('#side').prepend(sideX);
  function setSide(on) { $('#side').classList.toggle('open', !!on); sideBg.classList.toggle('on', !!on); }
  $('#menuBtn').onclick = () => setSide(!$('#side').classList.contains('open'));
  sideX.onclick = () => setSide(false); sideBg.onclick = () => setSide(false);
  $('#nav').addEventListener('click', e => { if (e.target.closest('a')) setSide(false); });
  $('#themeToggle').onclick = () => { const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; localStorage.setItem('tp_admin_theme', n); };

  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      const r = await POST('/api/admin/login', Object.fromEntries(new FormData(e.target)));
      await start();
      if (r.mustChangePw) { location.hash = '#/settings'; toast('임시 비밀번호입니다. 비밀번호를 변경하세요'); }
    } catch (er) { $('#loginErr').textContent = er.message; }
  };
  async function start() {
    S.me = await GET('/api/admin/me');
    $('#login').hidden = true; $('#app').hidden = false;
    $('#me').innerHTML = `<span class="av">${esc(S.me.name.slice(0, 1))}</span><div><b>${esc(S.me.name)}</b><small>${esc(S.me.roleLabel)}${STATIC && !STATIC.__fb ? ' · 정적 데모' : ''}</small></div>${STATIC && !STATIC.__fb ? '' : '<button class="btn sm" id="logout">로그아웃</button>'}`;
    $('#logout') && ($('#logout').onclick = async () => { await POST('/api/admin/logout'); location.reload(); });
    renderNav(); route();
  }
  start().catch(() => showLogin());
})();

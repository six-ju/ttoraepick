/* 또래픽 관리자 (정적 사이트용): 구글 로그인 + Firestore
   - 로그인: Firebase Auth (Google). 사장님 계정(owner)만 통과, 그 외 계정은 즉시 로그아웃
   - 데이터: 방문 행동(events)·업무·수익은 Firestore (보안 규칙으로 owner 만 읽기/쓰기)
             상품·키워드는 공개 카탈로그(../data/catalog.js), 조직·수집기 정보는 admin-meta.js
   - admin.js 의 API 호출(/api/admin/*)을 이 파일이 브라우저 안에서 처리 */
(() => {
  'use strict';
  const C = window.TP_FB, OWNER_H = window.TP_OWNER_H, META = window.TP_ADMIN_META || {}, DATA = window.TP_DATA || { products: [], meta: { sources: [], categories: [] }, keywords: { rows: [] } };
  const V = '10.12.2';
  let FB = null;
  const fb = () => FB || (FB = (async () => {
    const [appM, authM, fl] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore-lite.js`),
    ]);
    const app = appM.getApps()[0] || appM.initializeApp(C);
    const auth = authM.getAuth(app);
    const db = fl.getFirestore(app);
    const user = await new Promise(res => { const un = authM.onAuthStateChanged(auth, u => { un(); res(u); }); });
    return { app, auth, authM, db, fl, user };
  })());
  // 사장님 이메일은 코드에 적지 않고 SHA-256 해시로만 비교 (실제 권한 검사는 Firestore 보안 규칙이 서버에서 수행)
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const isOwner = async u => !!(u && u.email && u.emailVerified && (await sha(u.email.trim().toLowerCase())) === OWNER_H);

  // ---------- 로그인 화면: 구글 버튼 ----------
  function setupLogin() {
    const form = document.getElementById('loginForm');
    if (!form || form.dataset.fb) return;
    form.dataset.fb = 1;
    form.innerHTML = `<div class="lg-logo"><img src="../assets/favicon.svg" alt=""> 또래픽 <span>ADMIN</span></div>
      <h1>운영 콘솔</h1><p class="hint" style="text-align:left;margin:-4px 0 6px">사장님 구글 계정으로만 들어올 수 있어요.</p>
      <button type="button" class="btn lg" id="gLogin" style="gap:10px"><svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Google 계정으로 로그인</button>
      <p class="err" id="loginErr"></p>
      <p class="hint">허용되지 않은 계정은 자동으로 로그아웃됩니다. 이 화면은 검색엔진에 노출되지 않아요.</p>`;
    document.getElementById('gLogin').onclick = async () => {
      const err = document.getElementById('loginErr'); err.textContent = '';
      try {
        const { auth, authM } = await fb();
        const cred = await authM.signInWithPopup(auth, new authM.GoogleAuthProvider());
        if (!(await isOwner(cred.user))) { await authM.signOut(auth); err.textContent = '허용되지 않은 계정이에요 (' + (cred.user.email || '') + ')'; return; }
        localStorage.setItem('tp_owner', '1'); // 사장님 본인 방문은 통계에서 제외
        location.reload();
      } catch (e) { err.textContent = '로그인 실패: ' + (e.code || e.message); }
    };
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', setupLogin) : setupLogin();

  // ---------- 데이터 ----------
  const P = DATA.products, byId = new Map(P.map(p => [p.id, p]));
  const SRC = Object.fromEntries((DATA.meta.sources || []).map(s => [s.code, s]));
  const CAT = Object.fromEntries((DATA.meta.categories || []).map(c => [c.slug, c]));
  const kst = d => new Date(d.getTime() + 9 * 3600e3);
  const ymd = d => kst(d).toISOString().slice(0, 10);
  let evCache = { since: null, list: [] };
  async function events(sinceMs) {
    if (evCache.since !== null && evCache.since <= sinceMs) return evCache.list.filter(e => e.ts >= sinceMs);
    const { db, fl } = await fb();
    const qy = fl.query(fl.collection(db, 'events'), fl.where('ts', '>=', fl.Timestamp.fromMillis(sinceMs)), fl.orderBy('ts', 'desc'), fl.limit(30000));
    const snap = await fl.getDocs(qy);
    const list = snap.docs.map(d => { const x = d.data(); return { ...x, ts: x.ts ? x.ts.toMillis() : Date.now() }; });
    evCache = { since: sinceMs, list };
    return list;
  }
  async function col(name) {
    const { db, fl } = await fb();
    const snap = await fl.getDocs(fl.collection(db, 'admin', 'main', name));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function tasksList() {
    let list = await col('tasks');
    if (!list.length && (META.tasks || []).length) { // 최초 1회: 기본 런칭 업무를 Firestore 로 옮김
      const { db, fl } = await fb();
      for (const t of META.tasks) await fl.setDoc(fl.doc(db, 'admin', 'main', 'tasks', String(t.id)), { title: t.title, body: t.body || '', department: t.department || '', priority: t.priority || 'normal', status: t.status || 'todo', due_date: t.due_date || '', created_at: new Date().toISOString() });
      list = await col('tasks');
    }
    const D = Object.fromEntries((META.org?.departments || []).map(d => [d.code, d]));
    return list.map(t => ({ ...t, id: t.id, dept: D[t.department]?.name, color: D[t.department]?.color }));
  }
  const cnt = (arr, f) => arr.reduce((n, x) => n + (f(x) ? 1 : 0), 0);
  const uniq = (arr, f) => new Set(arr.filter(f).map(x => x.sid).filter(Boolean)).size;
  function kpi(list) {
    return { visitors: uniq(list, e => e.t === 'pageview'), pageviews: cnt(list, e => e.t === 'pageview'), views: cnt(list, e => e.t === 'view'), clicks: cnt(list, e => e.t === 'click'), wishes: cnt(list, e => e.t === 'wish'), searches: cnt(list, e => e.t === 'search'), ad_impr: cnt(list, e => e.t === 'ad_impression'), ad_clicks: cnt(list, e => e.t === 'ad_click') };
  }
  function revSum(rows) {
    const s = { commission: 0, orders: 0, gmv: 0, adsense: 0, affiliate: 0 };
    rows.forEach(r => { s.commission += +r.commission || 0; s.orders += +r.orders || 0; s.gmv += +r.gmv || 0; if (r.channel === 'adsense') s.adsense += +r.commission || 0; else s.affiliate += +r.commission || 0; });
    return s;
  }
  const groupBy = (arr, key) => arr.reduce((m, x) => { const k = key(x); (m[k] ||= []).push(x); return m; }, {});

  async function dashboard(q) {
    const days = Math.min(Math.max(+q.get('days') || 30, 1), 365), now = Date.now(), from = now - days * 864e5, prevFrom = from - days * 864e5;
    const all = await events(prevFrom), cur = all.filter(e => e.ts >= from), prev = all.filter(e => e.ts < from);
    const revenue = await col('revenue');
    const fromD = ymd(new Date(from)), prevD = ymd(new Date(prevFrom));
    const daily = Object.entries(groupBy(cur, e => ymd(new Date(e.ts)))).map(([d, l]) => ({ d, pageviews: cnt(l, e => e.t === 'pageview'), views: cnt(l, e => e.t === 'view'), clicks: cnt(l, e => e.t === 'click'), wishes: cnt(l, e => e.t === 'wish'), searches: cnt(l, e => e.t === 'search') })).sort((a, b) => a.d < b.d ? -1 : 1);
    const clicks = cur.filter(e => e.t === 'click'), views = cur.filter(e => e.t === 'view');
    const bySource = Object.entries(groupBy(clicks, e => e.s || 'etc')).map(([k, l]) => ({ k, name: SRC[k]?.name || k, color: SRC[k]?.color || '#999', clicks: l.length })).sort((a, b) => b.clicks - a.clicks);
    const byAge = Object.entries(groupBy(cur, e => e.a || 'all')).map(([k, l]) => ({ k, clicks: cnt(l, e => e.t === 'click'), views: cnt(l, e => e.t === 'view'), pageviews: cnt(l, e => e.t === 'pageview') })).sort((a, b) => a.k < b.k ? -1 : 1);
    const byCategory = Object.entries(groupBy(cur.filter(e => e.c), e => e.c)).map(([k, l]) => ({ k, name: CAT[k]?.name || k, icon: CAT[k]?.icon || '', clicks: cnt(l, e => e.t === 'click'), views: cnt(l, e => e.t === 'view') })).sort((a, b) => b.clicks - a.clicks);
    const byDevice = Object.entries(groupBy(cur, e => e.d || 'etc')).map(([k, l]) => ({ k, sessions: new Set(l.map(e => e.sid)).size, clicks: cnt(l, e => e.t === 'click') }));
    const heatM = {}; cur.filter(e => e.t === 'click' || e.t === 'view').forEach(e => { const t = kst(new Date(e.ts)); const k = t.getUTCDay() + '_' + t.getUTCHours(); heatM[k] = (heatM[k] || 0) + 1; });
    const heat = Object.entries(heatM).map(([k, n]) => { const [dow, h] = k.split('_').map(Number); return { dow, h, n }; });
    const topProducts = Object.entries(groupBy(cur.filter(e => e.p), e => e.p)).map(([id, l]) => { const p = byId.get(+id) || {}; return { id: +id, title: p.title || '(삭제된 상품 ' + id + ')', source: p.source, brand: p.brand, price: p.price, image: p.image, aff: /link\.coupang\.com/.test(p.go || ''), views: cnt(l, e => e.t === 'view'), clicks: cnt(l, e => e.t === 'click'), wishes: cnt(l, e => e.t === 'wish') }; }).sort((a, b) => b.clicks - a.clicks || b.views - a.views).slice(0, 10);
    const srch = cur.filter(e => e.t === 'search' && e.q);
    const topSearches = Object.entries(groupBy(srch, e => e.q)).map(([k, l]) => ({ k, n: l.length, avg_results: +(l.reduce((s, e) => s + (e.n || 0), 0) / l.length).toFixed(1), zero: cnt(l, e => !e.n) })).sort((a, b) => b.n - a.n).slice(0, 12);
    const zeroSearches = topSearches.filter(s => s.zero).map(s => ({ k: s.k, n: s.zero })).slice(0, 8);
    const tasks = await tasksList();
    const prio = { urgent: 0, high: 1, normal: 2, low: 3 };
    return {
      range: { days, from: new Date(from).toISOString() },
      cur: { ...kpi(cur), ...revSum(revenue.filter(r => r.date >= fromD)) }, prev: { ...kpi(prev), ...revSum(revenue.filter(r => r.date >= prevD && r.date < fromD)) },
      daily, revDaily: revenue.filter(r => r.date >= fromD).map(r => ({ d: r.date, channel: r.channel, commission: +r.commission || 0, orders: +r.orders || 0, gmv: +r.gmv || 0, clicks: +r.clicks || 0 })),
      bySource, byAge, byCategory, byDevice, heat, topProducts, topSearches, zeroSearches,
      funnel: { s1: uniq(cur, e => e.t === 'pageview'), s2: uniq(cur, e => e.t === 'view'), s3: uniq(cur, e => e.t === 'click') },
      catalog: { total: P.length, active: P.length, hidden: 0, affiliate: cnt(P, p => /link\.coupang\.com/.test(p.go || '')), stale: 0, noimg: cnt(P, p => !p.image) },
      bySourceCatalog: Object.values(SRC).map(s => ({ k: s.code, name: s.name, color: s.color, n: cnt(P, p => p.source === s.code) })),
      jobs: (META.collectors?.jobs || []).map(j => ({ code: j.code, name: j.name, enabled: j.enabled, last_run_at: j.last_run_at, last_status: j.last_status, last_message: j.last_message, interval_min: j.interval_min })),
      tasks: Object.entries(groupBy(tasks, t => t.status)).map(([status, l]) => ({ status, n: l.length })),
      urgentTasks: tasks.filter(t => t.status !== 'done').sort((a, b) => (prio[a.priority] ?? 2) - (prio[b.priority] ?? 2)).slice(0, 6),
      coupangApproval: { gmv: revenue.filter(r => r.channel === 'coupang').reduce((s, r) => s + (+r.gmv || 0), 0), goal: 150000 },
      demoCount: 0, keywordDate: DATA.keywords?.date,
    };
  }
  async function productStats(sinceMs) {
    const l = await events(sinceMs), m = new Map();
    l.forEach(e => { if (!e.p) return; const s = m.get(e.p) || { views: 0, clicks: 0, wishes: 0 }; if (e.t === 'view') s.views++; else if (e.t === 'click') s.clicks++; else if (e.t === 'wish') s.wishes++; m.set(e.p, s); });
    return m;
  }
  const full = p => ({ ...p, status: 'active', productUrl: p.go, affiliateUrl: /link\.coupang\.com/.test(p.go || '') ? p.go : null, score: p.score || 0, pinned: !!p.pinned });
  const SORT = { score: (a, b) => b.score - a.score, popular: (a, b) => Math.min(99, ...Object.values(a.ages || {})) - Math.min(99, ...Object.values(b.ages || {})) || b.score - a.score, price_asc: (a, b) => (a.price ?? 1e12) - (b.price ?? 1e12), review: (a, b) => (b.reviewCount || 0) - (a.reviewCount || 0), new: (a, b) => b.id - a.id };

  async function audit(action, target, detail) {
    try { const { db, fl, auth } = await fb(); await fl.addDoc(fl.collection(db, 'admin', 'main', 'logs'), { action, target: String(target ?? ''), detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? ''), name: auth.currentUser?.displayName || '', email: auth.currentUser?.email || '', created_at: new Date().toISOString() }); } catch { /* 무시 */ }
  }

  window.TP_ADMIN_STATIC = {
    __fb: true,
    '/api/admin/me': async () => {
      const { user } = await fb();
      if (!(await isOwner(user))) throw new Error('로그인 필요');
      localStorage.setItem('tp_owner', '1');
      return { id: 1, email: user.email, name: user.displayName || '대표', role: 'owner', roleLabel: '대표(오너) · 구글 로그인', perms: ['*'] };
    },
    '/api/admin/dashboard': q => dashboard(q),
    '/api/admin/live': async () => { const l = await events(Date.now() - 864e5); return { last5min: new Set(l.filter(e => e.ts > Date.now() - 5 * 60e3).map(e => e.sid)).size, events: l.slice(0, 30).map((e, i) => ({ id: i, type: e.t, age: e.a, query: e.q, device: e.d, created_at: new Date(e.ts).toISOString(), title: byId.get(e.p)?.title, source: e.s })) }; },
    '/api/admin/products': async q => {
      const st = await productStats(Date.now() - 30 * 864e5);
      const t = (q.get('q') || '').toLowerCase();
      let l = P.filter(p => (!t || ((p.title + ' ' + (p.brand || '') + ' ' + (p.keyword || '')).toLowerCase().includes(t))) && (!q.get('source') || p.source === q.get('source')) && (!q.get('category') || p.category === q.get('category')) && (!q.get('age') || (p.ages || {})[q.get('age')]) && (!q.get('status') || q.get('status') === 'active'));
      l = l.slice().sort(SORT[q.get('sort')] || SORT.score);
      const off = +q.get('offset') || 0, lim = +q.get('limit') || 50;
      return { items: l.slice(off, off + lim).map(p => ({ ...full(p), stats: st.get(p.id) || { views: 0, clicks: 0, wishes: 0 } })), total: l.length };
    },
    '/api/admin/products/:id': async (q, id) => {
      const p = byId.get(id); if (!p) throw new Error('상품 없음');
      const l = (await events(Date.now() - 30 * 864e5)).filter(e => e.p === id);
      const daily = Object.entries(groupBy(l, e => ymd(new Date(e.ts)))).map(([d, x]) => ({ d, views: cnt(x, e => e.t === 'view'), clicks: cnt(x, e => e.t === 'click') })).sort((a, b) => a.d < b.d ? -1 : 1);
      return { ...full(p), priceHistory: p.priceHistory || [], daily };
    },
    '/api/admin/keywords': async () => { const kwN = {}; P.forEach(p => { if (p.keyword) kwN[p.keyword] = (kwN[p.keyword] || 0) + 1; }); const rows = (DATA.keywords?.rows || []).filter(r => r.rank <= 10).map(r => ({ ...r, products: kwN[r.keyword] || 0 })); return { date: DATA.keywords?.date, dates: [DATA.keywords?.date], rows }; },
    '/api/admin/curations': async () => (DATA.meta.curations || []).map(c => ({ ...c, active: 1 })),
    '/api/admin/collectors': async () => META.collectors || { jobs: [], runs: [], env: {} },
    '/api/admin/revenue': async q => {
      const days = +q.get('days') || 30, fromD = ymd(new Date(Date.now() - days * 864e5));
      const rows = (await col('revenue')).sort((a, b) => a.date < b.date ? 1 : -1);
      const inR = rows.filter(r => r.date >= fromD);
      const byChannel = Object.entries(groupBy(inR, r => r.channel)).map(([channel, l]) => ({ channel, clicks: l.reduce((s, r) => s + (+r.clicks || 0), 0), orders: l.reduce((s, r) => s + (+r.orders || 0), 0), gmv: l.reduce((s, r) => s + (+r.gmv || 0), 0), commission: l.reduce((s, r) => s + (+r.commission || 0), 0) }));
      const monthly = Object.entries(groupBy(rows, r => r.date.slice(0, 7) + '|' + r.channel)).map(([k, l]) => { const [m, channel] = k.split('|'); return { m, channel, commission: l.reduce((s, r) => s + (+r.commission || 0), 0), gmv: l.reduce((s, r) => s + (+r.gmv || 0), 0) }; }).sort((a, b) => a.m < b.m ? -1 : 1);
      const cl = (await events(Date.now() - days * 864e5)).filter(e => e.t === 'click');
      const outClicks = Object.entries(groupBy(cl, e => ymd(new Date(e.ts)) + '|' + (e.s || 'etc'))).map(([k, l]) => { const [d, source] = k.split('|'); return { d, source, n: l.length }; });
      return { rows: inR.map(r => ({ ...r, is_demo: 0 })), byChannel, monthly, outClicks, approval: { gmv: rows.filter(r => r.channel === 'coupang').reduce((s, r) => s + (+r.gmv || 0), 0), goal: 150000 } };
    },
    '/api/admin/ads': async q => {
      const days = +q.get('days') || 30, l = (await events(Date.now() - days * 864e5)).filter(e => e.t === 'ad_impression' || e.t === 'ad_click');
      const stats = Object.entries(groupBy(l, e => e.slot || 'etc')).map(([slot, x]) => ({ slot, impressions: cnt(x, e => e.t === 'ad_impression'), clicks: cnt(x, e => e.t === 'ad_click') }));
      const rev = (await col('revenue')).filter(r => r.channel === 'adsense').map(r => ({ date: r.date, commission: +r.commission || 0 }));
      return { ...(META.ads || {}), stats, adsenseRevenue: rev };
    },
    '/api/admin/org': async () => META.org || { roles: [], departments: [], staff: [], taskStats: [] },
    '/api/admin/tasks': () => tasksList(),
    '/api/admin/settings': async () => META.settings || { settings: {}, system: {} },
    '/api/admin/logs': async () => (await col('logs')).sort((a, b) => a.created_at < b.created_at ? 1 : -1).slice(0, 200),
    // 쓰기: 업무·수익만 지원 (나머지는 서버 버전 기능)
    __write: async (method, url, body) => {
      const { db, fl, auth, authM } = await fb();
      const m = url.split('?')[0];
      if (m === '/api/admin/logout') { await authM.signOut(auth); localStorage.removeItem('tp_owner'); return { ok: true }; }
      if (m === '/api/admin/tasks' && method === 'POST') { const r = await fl.addDoc(fl.collection(db, 'admin', 'main', 'tasks'), { title: body.title, body: body.body || '', department: body.department || '', priority: body.priority || 'normal', status: body.status || 'todo', due_date: body.due_date || '', created_at: new Date().toISOString() }); audit('task_create', r.id, body.title); return { ok: true, id: r.id }; }
      let mm = m.match(/^\/api\/admin\/tasks\/([^/]+)$/);
      if (mm && method === 'PATCH') { const upd = {}; ['title', 'body', 'department', 'status', 'priority', 'due_date'].forEach(k => { if (k in body) upd[k] = body[k] ?? ''; }); upd.updated_at = new Date().toISOString(); await fl.updateDoc(fl.doc(db, 'admin', 'main', 'tasks', mm[1]), upd); audit('task_update', mm[1], upd); return { ok: true }; }
      if (mm && method === 'DELETE') { await fl.deleteDoc(fl.doc(db, 'admin', 'main', 'tasks', mm[1])); audit('task_delete', mm[1]); return { ok: true }; }
      if (m === '/api/admin/revenue' && method === 'POST') {
        const rows = Array.isArray(body.rows) ? body.rows : [body]; let n = 0;
        for (const x of rows) { if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') || !x.channel) continue; await fl.setDoc(fl.doc(db, 'admin', 'main', 'revenue', x.date + '_' + x.channel), { date: x.date, channel: String(x.channel), clicks: +x.clicks || 0, orders: +x.orders || 0, gmv: +x.gmv || 0, commission: +x.commission || 0, imported_from: x.imported_from || 'manual' }); n++; }
        audit('revenue_upsert', n); return { ok: true, n };
      }
      mm = m.match(/^\/api\/admin\/revenue\/([^/]+)$/);
      if (mm && method === 'DELETE') { await fl.deleteDoc(fl.doc(db, 'admin', 'main', 'revenue', mm[1])); audit('revenue_delete', mm[1]); return { ok: true }; }
      throw new Error('정적 사이트에서는 지원하지 않는 기능이에요 (업무·수익만 저장 가능)');
    },
  };
})();

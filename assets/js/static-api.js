/* 정적 빌드용 API 어댑터: 서버 없이 window.TP_DATA 로 /api/* 를 브라우저에서 처리 (GitHub Pages 배포용)
   서버 버전과 같은 응답 형태를 돌려줌. 클릭 추적은 localStorage 에만 남김. */
(() => {
  'use strict';
  window.TP_STATIC = true;
  const D = window.TP_DATA;
  const P = D.products; // shaped + go(구매 링크)
  const byId = new Map(P.map(p => [p.id, p]));
  const minRank = p => { const v = Object.values(p.ages || {}); return v.length ? Math.min(...v) : null; };
  const SORT = {
    popular: (a, b) => (b.pinned - a.pinned) || (b.score - a.score),
    score: (a, b) => b.score - a.score,
    price_asc: (a, b) => (a.price ?? 1e12) - (b.price ?? 1e12),
    price_desc: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    discount: (a, b) => (b.discountRate || 0) - (a.discountRate || 0) || b.score - a.score,
    review: (a, b) => (b.reviewCount || 0) - (a.reviewCount || 0),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewCount || 0) - (a.reviewCount || 0),
    new: (a, b) => b.id - a.id,
  };
  function products(q) {
    if (q.get('ids')) { const items = q.get('ids').split(',').map(Number).map(i => byId.get(i)).filter(Boolean); return { items, total: items.length }; }
    const age = q.get('age'), cat = q.get('category'), src = q.get('source'), brand = q.get('brand'), text = (q.get('q') || '').trim(), sort = q.get('sort') || 'popular';
    let list = P.filter(p => (!cat || cat === 'all' || p.category === cat) && (!src || src === 'all' || src.split(',').includes(p.source)) && (!brand || brand.split('|').includes(p.brand)));
    if (text) { const terms = text.toLowerCase().split(/\s+/); list = list.filter(p => terms.every(t => [p.title, p.brand, p.keyword, p.mall].some(f => (f || '').toLowerCase().includes(t)))); }
    const ageOk = age && age !== 'all';
    if (ageOk) list = list.filter(p => p.ages[age] || !Object.keys(p.ages).length).map(p => ({ ...p, ageRank: p.ages[age] || null }));
    else list = list.map(p => ({ ...p, ageRank: minRank(p) }));
    if (sort === 'popular') {
      // 쇼핑몰별 순위 교차 배치 (서버 ROW_NUMBER 로직과 동일)
      const ar = p => ageOk ? (p.ageRank ?? 999) : 0;
      const groups = {};
      list.forEach(p => (groups[p.source] ||= []).push(p));
      Object.values(groups).forEach(g => g.sort((a, b) => (b.pinned - a.pinned) || ar(a) - ar(b) || b.score - a.score).forEach((p, i) => { p._sr = i; }));
      list.sort((a, b) => (ageOk ? (a.ageRank == null) - (b.ageRank == null) : 0) || (b.pinned - a.pinned) || a._sr - b._sr || ar(a) - ar(b) || b.score - a.score);
    } else list.sort(SORT[sort] || SORT.popular);
    const off = +q.get('offset') || 0, lim = Math.min(+q.get('limit') || 24, 60);
    return { items: list.slice(off, off + lim), total: list.length };
  }
  function detail(id) {
    const p = byId.get(id);
    if (!p) return null;
    const related = P.filter(x => x.category === p.category && x.id !== p.id).sort((a, b) => ((b.brand === p.brand) - (a.brand === p.brand)) || b.score - a.score).slice(0, 8);
    return { ...p, priceHistory: p.priceHistory || [], related };
  }
  function brands(q) {
    const cat = q.get('category'), src = q.get('source'), m = new Map();
    P.forEach(p => { if (p.brand && (!cat || cat === 'all' || p.category === cat) && (!src || p.source === src)) m.set(p.brand, (m.get(p.brand) || 0) + 1); });
    return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 300);
  }
  function keywords(q) {
    const age = q.get('age'), cat = q.get('category'), lim = +q.get('limit') || 10, agg = new Map();
    D.keywords.rows.forEach(r => { if ((!age || r.age === age) && (!cat || cat === 'all' || r.category === cat)) { const a = agg.get(r.keyword) || { keyword: r.keyword, category: r.category, rank: r.rank, w: 0 }; a.w += 21 - r.rank; a.rank = Math.min(a.rank, r.rank); agg.set(r.keyword, a); } });
    return { date: D.keywords.date, items: [...agg.values()].sort((a, b) => b.w - a.w || a.rank - b.rank).slice(0, lim) };
  }
  function suggest(q) {
    const t = (q.get('q') || '').trim().toLowerCase();
    if (!t) return [];
    const kw = [...new Set(D.keywords.rows.map(r => r.keyword).filter(k => k.toLowerCase().includes(t)))].slice(0, 4).map(v => ({ v, t: 'keyword' }));
    const br = brands(new URLSearchParams()).filter(b => b.name.toLowerCase().includes(t)).slice(0, 4).map(b => ({ v: b.name, t: 'brand', n: b.count }));
    const pr = P.filter(p => p.title.toLowerCase().includes(t)).sort((a, b) => b.score - a.score).slice(0, 5).map(p => ({ id: p.id, v: p.title, t: 'product', img: p.image, price: p.price }));
    return [...kw, ...br, ...pr];
  }
  const ok = body => Promise.resolve(new Response(JSON.stringify(body), { status: body === null ? 404 : 200, headers: { 'Content-Type': 'application/json' } }));
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return origFetch(input, init);
    const u = new URL(url, 'http://x'), q = u.searchParams, path = u.pathname;
    if (path === '/api/meta') return ok(D.meta);
    if (path === '/api/products') return ok(products(q));
    const m = path.match(/^\/api\/products\/(\d+)$/); if (m) return ok(detail(+m[1]));
    if (path === '/api/brands') return ok(brands(q));
    if (path === '/api/sources') { const cat = q.get('category'), m = {}; P.forEach(p => { if (!cat || cat === 'all' || p.category === cat) m[p.source] = (m[p.source] || 0) + 1; }); return ok(Object.entries(m).map(([code, count]) => ({ code, count }))); }
    if (path === '/api/keywords') return ok(keywords(q));
    if (path === '/api/suggest') return ok(suggest(q));
    if (path === '/api/events') return ok({ ok: true });
    return ok(null);
  };
  const origBeacon = navigator.sendBeacon?.bind(navigator);
  if (origBeacon) navigator.sendBeacon = (url, data) => (String(url).startsWith('/api/') ? true : origBeacon(url, data));
})();

/* 또래픽 public app (vanilla JS, 빌드 불필요) */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = n => (n || n === 0) ? Number(n).toLocaleString('ko-KR') + '원' : '가격 확인';
  const num = n => Number(n || 0).toLocaleString('ko-KR');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => matchMedia('(max-width: 860px)').matches;
  // 정적 빌드(GitHub Pages/파일) 여부: 서버 없이 static-api.js 가 /api 를 대신 처리
  const STATIC = !!window.TP_STATIC;
  const ROOT = (() => { if (location.protocol === 'file:') return location.pathname; try { return new URL('./', document.baseURI).pathname; } catch { return '/'; } })();
  const detailUrl = id => STATIC ? ROOT + '?p=' + id : '/p/' + id;
  const shareUrl = id => location.origin + (STATIC ? ROOT + '?p=' + id : '/p/' + id);
  const detailIdFromUrl = () => STATIC ? +(new URLSearchParams(location.search).get('p') || 0) : +((location.pathname.match(/^\/p\/(\d+)/) || [])[1] || 0);
  const initialDetailId = (() => { try { return +(new URLSearchParams(location.search).get('p') || (location.pathname.match(/^\/p\/(\d+)/) || [])[1] || 0); } catch { return 0; } })();
  const buyHref = p => STATIC ? (p.go || '#') : `/go/${p.id}?age=${state.age}&sid=${sid}&from=detail`;
  const METRIC = { purchase: '구매 많은', click: '많이 본', search: '검색 많은', wish: '찜 많은' };
  const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#eceef4"/><text x="50" y="56" font-size="12" text-anchor="middle" fill="#9aa0b4" font-family="sans-serif">NO IMAGE</text></svg>');

  // ---------- 상태 ----------
  const params = new URLSearchParams(location.search);
  const state = {
    age: params.get('age') || localStorage.getItem('tp_age') || 'all',
    cat: params.get('cat') || 'all',
    source: params.get('src') || 'all',
    brand: params.get('brand') || '',
    q: params.get('q') || '',
    sort: params.get('sort') || 'popular',
  };
  let META = null, CATS = [], activeIdx = 0;
  const panels = new Map();      // slug -> {el, items, total, offset, loading, key}
  const productCache = new Map();

  // ---------- 분석 이벤트 (배치 전송) ----------
  const sid = sessionStorage.getItem('tp_sid') || (() => { const s = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('tp_sid', s); return s; })();
  let evq = [];
  const GA_EV = { search: 'search', view: 'view_item', click: 'go_to_store', share: 'share', wish: 'add_to_wishlist' };
  const track = (type, data = {}) => {
    evq.push({ type, sid, age: state.age === 'all' ? null : state.age, ...data }); if (evq.length >= 10) flush();
    try { if (window.gtag && GA_EV[type]) window.gtag('event', GA_EV[type], { search_term: data.query, item_id: data.productId ? String(data.productId) : undefined, store: data.source, category: data.category, age_group: state.age === 'all' ? undefined : state.age, placement: data.slot, results: data.resultCount }); } catch { /* 무시 */ }
  };
  const flush = () => {
    if (!evq.length) return;
    if (STATIC) { const batch = evq.splice(0, 30); if (window.TP_LOG) window.TP_LOG(batch); return; }
    const body = JSON.stringify({ events: evq.splice(0, 30) });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    else fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  };
  setInterval(flush, 4000);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  const api = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch { /* 권한 없음 → 대체 */ }
    try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
  }
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); };

  // ---------- 찜 / 최근 본 ----------
  const store = {
    get: k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  };
  const mini = p => ({ id: p.id, title: p.title, image: p.image, price: p.price, source: p.source, brand: p.brand });
  const isWished = id => store.get('tp_wish').some(x => x.id === id);
  function toggleWish(p, btn) {
    let list = store.get('tp_wish');
    const on = !list.some(x => x.id === p.id);
    list = on ? [mini(p), ...list].slice(0, 200) : list.filter(x => x.id !== p.id);
    store.set('tp_wish', list);
    track(on ? 'wish' : 'unwish', { productId: p.id, source: p.source, category: p.category });
    $$(`[data-wish="${p.id}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
    updateWishCount();
    toast(on ? '찜 목록에 담았어요' : '찜을 해제했어요');
  }
  const updateWishCount = () => { const n = store.get('tp_wish').length, b = $('#wishCount'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n; };
  const pushRecent = p => store.set('tp_recent', [mini(p), ...store.get('tp_recent').filter(x => x.id !== p.id)].slice(0, 40));

  // ---------- URL 동기화 ----------
  function listUrl() {
    const u = new URLSearchParams();
    if (state.age !== 'all') u.set('age', state.age);
    if (state.cat !== 'all') u.set('cat', state.cat);
    if (state.source !== 'all') u.set('src', state.source);
    if (state.brand) u.set('brand', state.brand);
    if (state.q) u.set('q', state.q);
    if (state.sort !== 'popular') u.set('sort', state.sort);
    const s = u.toString();
    return (STATIC ? ROOT : '/') + (s ? '?' + s : '');
  }
  const syncUrl = () => { if (!detailOpen) try { history.replaceState(history.state, '', listUrl()); } catch { /* */ } };

  // ---------- 히어로 / 연령 ----------
  function renderAges() {
    const box = $('#ageSwitch');
    box.insertAdjacentHTML('beforeend', META.ages.map(a => `<button role="tab" data-age="${a.code}" aria-selected="${a.code === state.age}">${esc(a.label)}</button>`).join(''));
    box.addEventListener('click', e => { const b = e.target.closest('[data-age]'); if (b) setAge(b.dataset.age); });
    moveInd(box, $('.age-ind', box), $(`[data-age="${state.age}"]`, box), false);
    setHeroWord(false);
  }
  function moveInd(container, ind, target, animate = true) {
    if (!target) return;
    if (!animate) ind.style.transition = 'none';
    ind.style.width = target.offsetWidth + 'px';
    ind.style.transform = `translateX(${target.offsetLeft}px)`;
    if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  function setHeroWord(anim = true) {
    const w = $('#ageWord'), label = state.age === 'all' ? '사람들' : (META.ages.find(a => a.code === state.age)?.label || '');
    w.textContent = label; $('#ageJosa').textContent = state.age === 'all' ? '은' : '는';
    if (anim) { w.classList.remove('swap'); void w.offsetWidth; w.classList.add('swap'); }
    $('#kwLabel').textContent = (state.age === 'all' ? '전체' : label) + ' 인기 검색어';
  }
  function setAge(age) {
    if (age === state.age) return;
    state.age = age; localStorage.setItem('tp_age', age);
    const box = $('#ageSwitch');
    $$('[data-age]', box).forEach(b => b.setAttribute('aria-selected', b.dataset.age === age));
    moveInd(box, $('.age-ind', box), $(`[data-age="${age}"]`, box));
    $(`[data-age="${age}"]`, box).scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    setHeroWord(); loadKeywords(); invalidate(); syncUrl();
    track('pageview', { referrer: 'age-switch' });
  }

  // ---------- 인기 검색어 ----------
  async function loadKeywords() {
    try {
      const d = await api(`/api/keywords?age=${state.age === 'all' ? '' : state.age}&limit=12`);
      const box = $('#kwBox');
      if (!d.items.length) { box.hidden = true; return; }
      box.hidden = false;
      const chips = d.items.map((k, i) => `<button class="kw-chip" data-kw="${esc(k.keyword)}"><b>${i + 1}</b>${esc(k.keyword)}</button>`).join('');
      $('#kwList').innerHTML = chips + chips; // 무한 마키
      renderSheetKeywords(d.items);
    } catch { $('#kwBox').hidden = true; }
  }
  $('#kwList').addEventListener('click', e => { const b = e.target.closest('[data-kw]'); if (b) runSearch(b.dataset.kw); });

  // ---------- 카테고리 탭 + 슬라이드 ----------
  function renderCats() {
    CATS = [{ slug: 'all', name: '전체', icon: '✨', count: META.categories.reduce((s, c) => s + c.count, 0) }, ...META.categories];
    const tabs = $('#catTabs');
    tabs.insertAdjacentHTML('beforeend', CATS.map((c, i) => `<button class="cat-tab" role="tab" data-idx="${i}" aria-selected="false" aria-controls="panel-${c.slug}"><span class="ic">${c.icon}</span>${esc(c.name)}<span class="n">${num(c.count)}</span></button>`).join(''));
    $('#catTrack').innerHTML = CATS.map(c => `<section class="cat-panel" id="panel-${c.slug}" data-slug="${c.slug}" role="tabpanel" aria-label="${esc(c.name)}"></section>`).join('');
    CATS.forEach(c => panels.set(c.slug, { el: $(`#panel-${c.slug}`), items: [], total: 0, offset: 0, loading: false, key: null }));
    tabs.addEventListener('click', e => { const b = e.target.closest('.cat-tab'); if (b) goTo(+b.dataset.idx, true); });
    $('#catPrev').onclick = () => goTo(activeIdx - 1, true);
    $('#catNext').onclick = () => goTo(activeIdx + 1, true);
    // 검색창 카테고리 select
    $('#searchCat').insertAdjacentHTML('beforeend', META.categories.map(c => `<option value="${c.slug}">${c.icon} ${esc(c.name)}</option>`).join(''));
    const idx = Math.max(0, CATS.findIndex(c => c.slug === state.cat));
    activeIdx = -1; setActive(idx, false);
    requestAnimationFrame(() => { $('#catTrack').scrollLeft = idx * $('#catTrack').clientWidth; });
  }
  let programmatic = false, scrollT = null;
  function goTo(idx, userAction) {
    idx = Math.max(0, Math.min(CATS.length - 1, idx));
    const track_ = $('#catTrack');
    programmatic = true;
    setActive(idx, true);
    track_.scrollTo({ left: idx * track_.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    // 스크롤이 카테고리 바보다 아래면 목록 상단으로
    const bar = $('#bar'), top = $('#catViewport').getBoundingClientRect().top + scrollY - bar.offsetHeight - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--head'));
    if (userAction && scrollY > top) window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    clearTimeout(scrollT); scrollT = setTimeout(() => { programmatic = false; }, 900);
  }
  function setActive(idx, animate = true) {
    if (idx === activeIdx) return;
    activeIdx = idx;
    const c = CATS[idx];
    state.cat = c.slug;
    $$('.cat-tab').forEach((t, i) => t.setAttribute('aria-selected', i === idx));
    const tab = $$('.cat-tab')[idx];
    moveInd($('#catTabs'), $('.cat-ind'), tab, animate);
    tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: animate && !reduced ? 'smooth' : 'auto' });
    $$('.cat-panel').forEach((p, i) => p.classList.toggle('active', i === idx));
    $('#catPrev').disabled = idx === 0; $('#catNext').disabled = idx === CATS.length - 1;
    if ($('#searchCat').value !== c.slug) { $('#searchCat').value = c.slug; loadBrands(); }
    const vp = $('#catViewport');
    ensurePanel(c.slug);
    // 이웃 패널 미리 로드 → 스와이프 시 바로 보임
    [idx - 1, idx + 1].forEach(i => CATS[i] && setTimeout(() => ensurePanel(CATS[i].slug), 400));
    refreshAds();
    fitHeight();
    syncUrl();
  }
  $('#catTrack').addEventListener('scroll', () => {
    if (programmatic) return;
    clearTimeout(scrollT);
    scrollT = setTimeout(() => {
      const t = $('#catTrack'), idx = Math.round(t.scrollLeft / t.clientWidth);
      if (idx !== activeIdx) setActive(idx, true);
    }, 70);
  }, { passive: true });
  $('#catTrack').addEventListener('scrollend', () => { programmatic = false; const t = $('#catTrack'); const idx = Math.round(t.scrollLeft / t.clientWidth); if (idx !== activeIdx) setActive(idx, true); });
  addEventListener('resize', () => {
    const t = $('#catTrack'); t.scrollLeft = activeIdx * t.clientWidth;
    moveInd($('#catTabs'), $('.cat-ind'), $$('.cat-tab')[activeIdx], false);
    const box = $('#ageSwitch'); moveInd(box, $('.age-ind', box), $(`[data-age="${state.age}"]`, box), false);
    fitHeight();
  });
  // 활성 패널 높이에 뷰포트 높이를 맞춤 (값이 바뀔 때만, 다음 프레임에 1번 → ResizeObserver 루프 방지)
  let observed = null, lastH = 0, fitRaf = 0;
  const applyHeight = () => { fitRaf = 0; const p = $$('.cat-panel')[activeIdx]; if (!p) return; const h = p.offsetHeight; if (Math.abs(h - lastH) > 1) { lastH = h; $('#catViewport').style.height = h + 'px'; } };
  const ro = new ResizeObserver(() => { if (!fitRaf) fitRaf = requestAnimationFrame(applyHeight); });
  function fitHeight() {
    const p = $$('.cat-panel')[activeIdx];
    if (!p) return;
    if (observed !== p) { if (observed) ro.unobserve(observed); ro.observe(p); observed = p; }
    if (!fitRaf) fitRaf = requestAnimationFrame(applyHeight);
  }

  // ---------- 상품 목록 ----------
  const filterKey = () => JSON.stringify([state.age, state.source, state.brand, state.q, state.sort]);
  function invalidate() {
    for (const p of panels.values()) p.key = null;
    ensurePanel(state.cat);
    renderActiveFilters();
  }
  function ensurePanel(slug) {
    const p = panels.get(slug);
    if (!p || p.key === filterKey()) return;
    loadPanel(slug, true);
  }
  async function loadPanel(slug, reset) {
    const p = panels.get(slug);
    const key = filterKey();
    const my = p.req = (p.req || 0) + 1; // 최신 요청만 반영 (필터가 빠르게 바뀌는 경우)
    if (reset) { p.items = []; p.offset = 0; p.key = key; p.el.innerHTML = panelHead(slug, null) + `<div class="grid">${skeletons(isMobile() ? 6 : 12)}</div>`; fitHeight(); }
    p.loading = true;
    const u = new URLSearchParams({ limit: isMobile() ? 20 : 24, offset: p.offset, sort: state.sort });
    if (slug !== 'all') u.set('category', slug);
    if (state.age !== 'all') u.set('age', state.age);
    if (state.source !== 'all') u.set('source', state.source);
    if (state.brand) u.set('brand', state.brand);
    if (state.q) u.set('q', state.q);
    try {
      const d = await api('/api/products?' + u);
      if (my !== p.req || p.key !== key) return; // 그 사이 더 새 요청이 있음
      const start = p.items.length;
      p.items.push(...d.items); p.total = d.total; p.offset += d.items.length;
      if (reset) p.el.innerHTML = panelHead(slug, d.total) + `<div class="grid"></div>`;
      const grid = $('.grid', p.el);
      if (!d.total) grid.outerHTML = emptyHtml();
      else {
        const cols = gridCols(grid);
        grid.insertAdjacentHTML('beforeend', d.items.map((it, i) => cardHtml(it, start + i) + adAfter(start + i, cols)).join(''));
        $$('.tp-slot:not([data-done])', grid).forEach(renderAd);
        bindImgs(grid);
      }
      $('.more', p.el)?.remove();
      const moreHtml = `<button class="more" data-more="${slug}">더 보기 <small>(${num(p.offset)} / ${num(p.total)})</small></button>`;
      if (p.offset < p.total) { const g2 = $('.grid', p.el); g2 ? g2.insertAdjacentHTML('afterend', moreHtml) : p.el.insertAdjacentHTML('beforeend', moreHtml); }
      if (state.q && reset && slug === state.cat) track('search', { query: state.q, resultCount: d.total, category: slug === 'all' ? null : slug });
      if (state.q && reset) liveSearch(p, slug);
    } catch (e) {
      if (my !== p.req) return;
      p.el.innerHTML = panelHead(slug, 0) + `<div class="empty"><b>⚠️</b>목록을 불러오지 못했어요. <button class="more" data-retry="${slug}">다시 시도</button></div>`;
      p.key = null;
    } finally { p.loading = false; if (slug === state.cat) fitHeight(); }
  }
  // ---------- 쇼핑몰 실시간 검색 (Cloudflare Worker) ----------
  // 사이트 특성상 쇼핑몰별 최대 4개(쇼핑몰을 고르면 12개)만 보여줌 → 외부 쇼핑몰 부하·과도한 호출 방지
  const LIVE_API = window.TP_SEARCH || '';
  const LIVE_NAME = { coupang: '쿠팡', naver: '네이버쇼핑', daiso: '다이소', musinsa: '무신사', oliveyoung: '올리브영' };
  const liveCache = new Map();
  // 검색어의 분야 추정 (또래픽 인기 검색어·상품 데이터 기준) → 식품 검색엔 패션몰(무신사) 결과 제외
  function guessCat(qtext) {
    const D = window.TP_DATA; if (!D) return null;
    const cnt = {};
    for (const r of D.keywords?.rows || []) if (r.keyword === qtext || r.keyword.includes(qtext)) cnt[r.category] = (cnt[r.category] || 0) + 3;
    for (const x of D.products || []) if ((x.title || '').includes(qtext)) cnt[x.category] = (cnt[x.category] || 0) + 1;
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  }
  async function liveSearch(p, slug) {
    if (!LIVE_API || !state.q) return;
    const qtext = state.q, src = state.source === 'all' ? 'all' : state.source, key = src + '|' + qtext;
    $('.live', p.el)?.remove();
    let d = liveCache.get(key);
    try {
      if (!d) { const r = await fetch(LIVE_API + '/search?q=' + encodeURIComponent(qtext) + '&store=' + src); if (!r.ok) throw new Error(r.status); d = await r.json(); liveCache.set(key, d); }
    } catch { return; } // 실패하면 아무것도 표시하지 않음
    if (state.q !== qtext || !p.el.isConnected) return;
    const skip = guessCat(qtext) === 'food' ? ['musinsa'] : [];
    const order = ['coupang', 'musinsa', 'daiso', 'oliveyoung', 'naver'].filter(s => d.stores[s] && (d.stores[s].items || []).length && !skip.includes(s));
    if (!order.length) return; // 제대로 된 결과가 없으면 영역 자체를 숨김
    // 화면 표시 개수: 전체 검색은 합계 최대 12개(쇼핑몰별 최대 6개), 쇼핑몰 선택은 최대 20개
    const per = src === 'all' ? Math.min(6, Math.max(3, Math.floor(12 / order.length))) : 20;
    let hasCoupang = false;
    const body = order.map(s => {
      const r = d.stores[s], items = r.items.slice(0, per);
      if (s === 'coupang') hasCoupang = true;
      return `<div class="live-store"><div class="live-store-head"><b class="src-badge ${s}">${LIVE_NAME[s]}</b><span>${items.length}개</span><a class="live-more" href="${esc(r.more)}" target="_blank" rel="noopener nofollow${s === 'coupang' ? ' sponsored' : ''}" data-live-src="${s}">${LIVE_NAME[s]}에서 더 보기 →</a></div><div class="live-row">${items.map(it => `<a class="live-card" href="${esc(it.url)}" target="_blank" rel="noopener nofollow${it.affiliate ? ' sponsored' : ''}" data-live-src="${s}"><span class="lc-img">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="lc-brand">${esc(it.brand || LIVE_NAME[s])}</span><span class="lc-title">${esc(it.title)}</span><span class="lc-price">${it.discountRate ? `<em>${it.discountRate}%</em>` : ''}<b>${won(it.price)}</b></span>${it.rating ? `<span class="lc-meta">★ ${Number(it.rating).toFixed(1)}${it.reviews ? ' · 리뷰 ' + num(it.reviews) : ''}</span>` : ''}</a>`).join('')}</div></div>`;
    }).join('');
    p.el.insertAdjacentHTML('beforeend', `<section class="live"><div class="live-head"><h3>🔎 쇼핑몰에서 바로 찾은 “${esc(qtext)}”</h3><p class="live-note">사이트 특성상 ${src === 'all' ? '쇼핑몰별 최대 6개, 합계 12개' : '최대 20개'}까지만 보여드려요. 가격·재고는 각 쇼핑몰 기준이라 바뀔 수 있어요.</p></div><div class="live-body">${body}${hasCoupang ? '<p class="live-disc">쿠팡 결과는 쿠팡 파트너스 활동의 일환으로, 구매 시 이에 따른 일정액의 수수료를 제공받습니다.</p>' : ''}</div></section>`);
    if (slug === state.cat) fitHeight();
  }
  document.addEventListener('click', e => { const a = e.target.closest('[data-live-src]'); if (a) { track('click', { source: a.dataset.liveSrc, query: state.q, slot: a.classList.contains('live-more') ? 'live_more' : 'live' }); flush(); } });
  function panelHead(slug, total) {
    const c = CATS.find(x => x.slug === slug);
    const ageLabel = state.age === 'all' ? '전체 연령' : META.ages.find(a => a.code === state.age)?.label;
    return `<div class="panel-head"><h2>${c.icon} ${esc(c.name)}${total !== null ? `<small>${num(total)}개</small>` : ''}</h2><span class="src-note">${esc(ageLabel)} 기준 · 판매처 순위 + 또래픽 반응 점수 · <a href="${STATIC ? ROOT : '/'}ranking.html">순위 기준</a></span></div>`;
  }
  const skeletons = n => Array.from({ length: n }, () => '<div class="skel"><div class="s-img"></div><div class="s-line"></div><div class="s-line w60"></div></div>').join('');
  const emptyHtml = () => `<div class="empty"><b>🔍</b>조건에 맞는 상품이 없어요.<br>검색어나 필터를 바꿔 보세요.${state.q || state.brand || state.source !== 'all' ? '<br><button class="more" data-reset>필터 초기화</button>' : ''}</div>`;
  function cardHtml(p, i, { rank = true } = {}) {
    const src = META.sources.find(s => s.code === p.source) || {};
    const ranks = Object.entries(p.ages || {}).sort((a, b) => a[1] - b[1]);
    const showRank = rank && state.sort === 'popular' && !state.q;
    const ageTags = ranks.slice(0, 3).map(([a, r]) => `<span class="age-tag ${a === state.age ? 'cur' : ''}">${a === '60' ? '60대+' : a + '대'} ${r}위</span>`).join('');
    return `<article class="card" data-id="${p.id}" style="--i:${i % 12}">
      <button class="card-hit" data-open="${p.id}" aria-label="${esc(p.title)} 상세 보기">
        <div class="thumb"><img src="${esc(p.image || PLACEHOLDER)}" alt="" loading="${i < 8 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">
          ${showRank ? `<span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span>` : ''}
          <span class="src-badge ${p.source}" style="--c:${src.color || '#333'}">${esc(src.name || p.source)}</span>
          ${p.metric && METRIC[p.metric] ? `<span class="metric">${METRIC[p.metric]}</span>` : ''}
        </div>
        <div class="info">
          <div class="brand">${esc(p.brand || p.mall || src.name || '')}</div>
          <h3 class="title">${esc(p.title)}</h3>
          <div class="price">${p.discountRate ? `<span class="disc">${p.discountRate}%</span>` : ''}<strong>${won(p.price)}</strong>${p.originalPrice ? `<del>${num(p.originalPrice)}</del>` : ''}</div>
          <div class="meta">${p.rating ? `<span class="star">★ ${Number(p.rating).toFixed(1)}</span>` : ''}${p.reviewCount ? `<span>리뷰 ${num(p.reviewCount)}</span>` : ''}${p.keyword ? `<span>#${esc(p.keyword)}</span>` : ''}</div>
          ${cmpHtml(p)}
          ${ageTags ? `<div class="age-tags">${ageTags}</div>` : ''}
        </div>
      </button>
      <button class="wish ${isWished(p.id) ? 'on' : ''}" data-wish="${p.id}" aria-pressed="${isWished(p.id)}" aria-label="찜하기"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
    </article>`;
  }
  // 가격 비교 배지: 내가 최저가면 '최저가', 다른 곳이 더 싸면 그곳 가격
  function cmpHtml(p) {
    const offs = (p.offers || []).filter(o => o.price);
    if (!offs.length || !p.price) return '';
    const min = offs.reduce((a, b) => (b.price < a.price ? b : a));
    if (p.price <= min.price) return '<div class="cmp low">✓ 최저가 <small>' + (offs.length + 1) + '곳 비교</small></div>';
    const name = min.mall || (META.sources.find(s => s.code === min.source) || {}).name || min.source;
    return '<div class="cmp alt">↓ ' + esc(name) + ' ' + won(min.price) + '</div>';
  }
  function bindImgs(root) {
    $$('img:not([data-b])', root).forEach(img => {
      img.dataset.b = 1;
      const ok = () => img.classList.add('ok');
      if (img.complete && img.naturalWidth) ok(); else img.addEventListener('load', ok, { once: true });
      img.addEventListener('error', () => { img.src = PLACEHOLDER; ok(); }, { once: true });
    });
  }
  const itemById = id => { for (const p of panels.values()) { const f = p.items.find(x => x.id === id); if (f) return f; } return productCache.get(id); };

  // 위임 이벤트
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    const wish = e.target.closest('[data-wish]');
    const more = e.target.closest('[data-more]');
    if (wish) { e.preventDefault(); const id = +wish.dataset.wish; const p = itemById(id) || store.get('tp_wish').find(x => x.id === id); if (p) toggleWish(p, wish); return; }
    if (open) { e.preventDefault(); openDetail(+open.dataset.open, open.closest('.card')); return; }
    if (more) { more.disabled = true; more.textContent = '불러오는 중…'; loadPanel(more.dataset.more, false); return; }
    if (e.target.closest('[data-retry]')) { loadPanel(e.target.closest('[data-retry]').dataset.retry, true); return; }
    if (e.target.closest('[data-reset]')) { resetFilters(); }
  });
  // 상세 데이터 미리 받아두기 (hover/touch) → 확대 전환이 즉시 시작
  document.addEventListener('pointerover', e => { const o = e.target.closest('[data-open]'); if (o) getProduct(+o.dataset.open).catch(() => {}); }, { passive: true });

  // ---------- 쇼핑몰 필터 / 정렬 ----------
  function renderSources() {
    const box = $('#srcChips');
    box.innerHTML = `<button class="src-chip" data-src="all" aria-pressed="${state.source === 'all'}">전체 쇼핑몰</button>` +
      META.sources.filter(s => s.count).map(s => `<button class="src-chip" data-src="${s.code}" aria-pressed="${state.source === s.code}"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('');
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-src]'); if (!b) return;
      state.source = b.dataset.src;
      syncSourceUI(); invalidate(); syncUrl();
    });
    $('#sortSel').value = state.sort;
    $('#sortSel').onchange = e => { state.sort = e.target.value; invalidate(); syncUrl(); };
  }
  function renderActiveFilters() {
    const box = $('#activeFilters'), chips = [];
    if (state.q) chips.push(`<span class="af">“${esc(state.q)}” 검색<button data-af="q" aria-label="검색어 제거">×</button></span>`);
    if (state.brand) chips.push(`<span class="af">회사: ${esc(state.brand)}<button data-af="brand" aria-label="회사 필터 제거">×</button></span>`);
    if (state.source !== 'all') chips.push(`<span class="af">${esc(META.sources.find(s => s.code === state.source)?.name)}<button data-af="source" aria-label="쇼핑몰 필터 제거">×</button></span>`);
    box.hidden = !chips.length;
    box.innerHTML = chips.join('') + (chips.length > 1 ? '<button class="af-reset" data-reset>전체 해제</button>' : '');
  }
  $('#activeFilters').addEventListener('click', e => {
    const b = e.target.closest('[data-af]'); if (!b) return;
    const k = b.dataset.af;
    if (k === 'q') { state.q = ''; $('#searchInput').value = ''; $('#searchClear').hidden = true; }
    if (k === 'brand') { state.brand = ''; }
    if (k === 'source') { state.source = 'all'; syncSourceUI(); }
    invalidate(); syncUrl();
  });
  function resetFilters() {
    Object.assign(state, { q: '', brand: '', source: 'all' });
    $('#searchInput').value = ''; $('#searchClear').hidden = true;
    syncSourceUI(); invalidate(); syncUrl();
  }

  // ---------- 검색 (카테고리 → 회사 → 검색어) ----------
  // '회사' 선택 = 판매 쇼핑몰(쿠팡·네이버·다이소·무신사·올리브영). 개수는 선택한 카테고리 기준
  async function loadBrands() {
    const cat = $('#searchCat').value, sel = $('#searchBrand');
    let counts = {};
    try { counts = Object.fromEntries((await api('/api/sources?category=' + cat)).map(s => [s.code, s.count])); } catch { /* 개수 없이 표시 */ }
    sel.innerHTML = '<option value="all">모든 쇼핑몰</option>' + META.sources.filter(s => s.count).map(s => '<option value="' + s.code + '">' + esc(s.name) + (counts[s.code] != null ? ' (' + counts[s.code] + ')' : '') + '</option>').join('');
    sel.value = state.source;
  }
  const syncSourceUI = () => { $$('#srcChips [data-src]').forEach(x => x.setAttribute('aria-pressed', x.dataset.src === state.source)); if ($('#searchBrand').value !== state.source) $('#searchBrand').value = state.source; };
  $('#searchCat').addEventListener('change', () => { loadBrands(); });
  $('#searchBrand').addEventListener('change', e => { state.source = e.target.value || 'all'; syncSourceUI(); const idx = CATS.findIndex(c => c.slug === $('#searchCat').value); if (idx !== activeIdx) goTo(idx, true); invalidate(); syncUrl(); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); runSearch($('#searchInput').value.trim(), true); });
  function runSearch(text, fromForm) {
    state.q = text;
    $('#searchInput').value = text; $('#searchClear').hidden = !text;
    if (fromForm) { state.source = $('#searchBrand').value || 'all'; syncSourceUI(); }
    hideSuggest(); closeSearchSheet();
    const idx = Math.max(0, CATS.findIndex(c => c.slug === (fromForm ? $('#searchCat').value : state.cat)));
    if (idx !== activeIdx) goTo(idx, true);
    invalidate(); syncUrl();
    const top = $('#bar').getBoundingClientRect().top + scrollY - 70;
    if (scrollY < top - 200 || scrollY > top + 400) window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  }
  $('#searchClear').onclick = () => { $('#searchInput').value = ''; $('#searchClear').hidden = true; if (state.q) runSearch(''); $('#searchInput').focus(); };
  let sgT = null, sgIdx = -1;
  $('#searchInput').addEventListener('input', e => {
    $('#searchClear').hidden = !e.target.value;
    clearTimeout(sgT);
    const v = e.target.value.trim();
    if (!v) return hideSuggest();
    sgT = setTimeout(async () => {
      const list = await api('/api/suggest?q=' + encodeURIComponent(v)).catch(() => []);
      const box = $('#suggest');
      if (!list.length) return hideSuggest();
      const T = { keyword: '키워드', brand: '회사', product: '상품' };
      box.innerHTML = list.map((s, i) => `<button type="button" class="sg-item" role="option" data-i="${i}" data-t="${s.t}" data-v="${esc(s.v)}" ${s.id ? `data-pid="${s.id}"` : ''}>
        ${s.img ? `<img src="${esc(s.img)}" alt="" referrerpolicy="no-referrer">` : ''}<span class="t">${T[s.t]}</span><span class="v">${esc(s.v)}</span>${s.price ? `<span class="p">${won(s.price)}</span>` : ''}</button>`).join('');
      box.hidden = false; sgIdx = -1;
    }, 140);
  });
  $('#searchInput').addEventListener('keydown', e => {
    const items = $$('.sg-item'); if ($('#suggest').hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sgIdx = (sgIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, i) => x.classList.toggle('on', i === sgIdx)); }
    else if (e.key === 'Enter' && sgIdx >= 0) { e.preventDefault(); items[sgIdx].click(); }
    else if (e.key === 'Escape') hideSuggest();
  });
  $('#suggest').addEventListener('click', e => {
    const b = e.target.closest('.sg-item'); if (!b) return;
    if (b.dataset.pid) { hideSuggest(); closeSearchSheet(); openDetail(+b.dataset.pid, null); return; }
    if (b.dataset.t === 'brand') { state.brand = b.dataset.v; $('#searchInput').value = ''; state.q = ''; hideSuggest(); closeSearchSheet(); invalidate(); syncUrl(); return; }
    runSearch(b.dataset.v);
  });
  const hideSuggest = () => { $('#suggest').hidden = true; };
  document.addEventListener('click', e => { if (!e.target.closest('.search')) hideSuggest(); });

  // 모바일: 같은 검색 폼을 시트로 옮겨 사용
  const formHome = $('#searchForm').parentNode, formNext = $('#searchForm').nextSibling;
  $('#openSearch').onclick = () => {
    $('#msearch').hidden = false; document.documentElement.classList.add('lock');
    $('#msearchBody').prepend($('#searchForm'));
    setTimeout(() => $('#searchInput').focus(), 50);
  };
  function closeSearchSheet() {
    if ($('#msearch').hidden) return;
    $('#msearch').hidden = true; if (!detailOpen) document.documentElement.classList.remove('lock');
    formHome.insertBefore($('#searchForm'), formNext);
  }
  $('#closeSearch').onclick = closeSearchSheet;
  function renderSheetKeywords(items) {
    const body = $('#msearchBody');
    $('.msearch-kw', body)?.remove();
    body.insertAdjacentHTML('beforeend', `<div class="msearch-kw"><h5>🔥 ${esc($('#kwLabel').textContent)}</h5><div class="chips">${items.map((k, i) => `<button class="kw-chip" data-kw2="${esc(k.keyword)}"><b>${i + 1}</b>${esc(k.keyword)}</button>`).join('')}</div></div>`);
  }
  $('#msearchBody').addEventListener('click', e => { const b = e.target.closest('[data-kw2]'); if (b) runSearch(b.dataset.kw2); });

  // ---------- 상세: 확대 전환 ----------
  // 원칙: (1) 목록에 있는 데이터로 즉시 연다 (네트워크 대기 0) (2) 이미지만 카드→상세로 확대(비율 동일 1:1)
  //       (3) 시트는 페이드+살짝 위로 (4) 나머지(가격추이·관련상품·가격비교)는 받아오는 대로 채움
  let detailOpen = null, pushedHistory = false;
  async function getProduct(id) {
    const c = productCache.get(id);
    if (c && c.related) return c;
    if (c && c._pending) return c._pending;
    const pending = api('/api/products/' + id).then(d => { productCache.set(id, d); return d; });
    productCache.set(id, { ...(c || {}), _pending: pending });
    return pending;
  }
  const baseOf = id => { const c = productCache.get(id); return (c && c.title) ? c : itemById(id); };
  const ageName = a => a === '60' ? '60대+' : a + '대';
  // 같은 상품의 여러 판매처 중 최저가 (가격 비교)
  function offersOf(p) {
    const src = META.sources.find(s => s.code === p.source) || {};
    const list = [{ self: true, source: p.source, mall: src.name || p.source, price: p.price, href: buyHref(p) }];
    (p.offers || []).forEach((o, i) => list.push({ source: o.source, mall: o.mall || (META.sources.find(s => s.code === o.source)?.name) || o.source, price: o.price, href: STATIC ? (o.go || o.url) : '/go/' + p.id + '?offer=' + i + '&age=' + state.age + '&sid=' + sid, title: o.title }));
    return list.filter(x => x.price).sort((a, b) => a.price - b.price);
  }
  function detailHtml(p) {
    const src = META.sources.find(s => s.code === p.source) || {};
    const cat = META.categories.find(c => c.slug === p.category);
    const ranks = Object.entries(p.ages || {}).sort((a, b) => a[0] - b[0]);
    const offers = offersOf(p), best = offers[0], cheaperElsewhere = best && !best.self && best.price < p.price;
    const buyLabel = cheaperElsewhere ? best.mall + ' 최저가로 구매하기' : (src.name || '판매처') + '에서 구매하기';
    return '<div class="d-grab" aria-hidden="true"></div>'
      + '<div class="d-main">'
      + '<div class="d-media"><div class="d-img"><img src="' + esc(p.image || PLACEHOLDER) + '" alt="' + esc(p.title) + '" referrerpolicy="no-referrer" decoding="sync"></div></div>'
      + '<div class="d-body">'
      + '<div class="d-src"><span class="dot" style="background:' + src.color + '"></span>' + esc(src.name || p.source) + (p.brand ? ' · ' + esc(p.brand) : '') + (cat ? ' · ' + cat.icon + ' ' + esc(cat.name) : '') + (p.metric && METRIC[p.metric] ? ' · ' + METRIC[p.metric] + ' 상품' : '') + '</div>'
      + '<h2 class="d-title" id="dTitle">' + esc(p.title) + '</h2>'
      + (ranks.length ? '<div class="d-ranks">' + ranks.map(([a, r]) => '<span class="d-rank ' + (a === state.age ? 'cur' : '') + '">' + ageName(a) + ' <b>' + r + '위</b></span>').join('') + '</div>' : '')
      + '<div class="d-price">' + (p.discountRate ? '<span class="disc">' + p.discountRate + '%</span>' : '') + '<strong>' + won(p.price) + '</strong>' + (p.originalPrice ? '<del>' + won(p.originalPrice) + '</del>' : '')
      + (offers.length > 1 && best.self ? '<span class="lowest">최저가</span>' : '')
      + '<span class="when">' + esc(META.site.priceNotice) + (p.updatedAt ? ' (수집 ' + esc(String(p.updatedAt).slice(0, 16)) + ')' : '') + '</span></div>'
      + '<div id="dOffers">' + offersHtml(p, offers) + '</div>'
      + '<div class="d-facts">'
      + '<div class="fact"><span>별점</span><b>' + (p.rating ? '★ ' + Number(p.rating).toFixed(1) : '-') + '</b></div>'
      + '<div class="fact"><span>리뷰</span><b>' + (p.reviewCount ? num(p.reviewCount) : '-') + '</b></div>'
      + '<div class="fact"><span>' + (p.keyword ? '연관 검색어' : '판매처 순위') + '</span><b>' + (p.keyword ? '#' + esc(p.keyword) : (p.sourceRank ? p.sourceRank + '위' : '-')) + '</b></div>'
      + '</div>'
      + '<div id="dSpark"></div>'
      + ((p.badges || []).length ? '<div class="d-ranks">' + p.badges.map(b => '<span class="d-rank">' + esc(b) + '</span>').join('') + '</div>' : '')
      + '<div class="d-cta">'
      + '<a class="buy" href="' + esc(best ? best.href : buyHref(p)) + '" target="_blank" rel="sponsored noopener nofollow">' + esc(buyLabel) + (cheaperElsewhere ? ' · ' + won(best.price) : '') + ' <svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></a>'
      + '<button class="sq ' + (isWished(p.id) ? 'on' : '') + '" data-wish="' + p.id + '" aria-label="찜하기"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>'
      + '<button class="sq" data-share="' + p.id + '" aria-label="공유하기"><svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/></svg></button>'
      + '</div>'
      + ((p.source === 'coupang' || offers.some(o => o.source === 'coupang')) ? '<p class="d-disc">' + esc(META.site.disclosure) + '</p>' : '<p class="d-disc">구매하기를 누르면 판매처 상품 페이지로 이동합니다.</p>')
      + '</div></div>'
      + '<div class="d-sec"><div class="tp-slot" data-slot="detail_bottom"></div><div id="dRel"></div></div>';
  }
  function offersHtml(p, offers) {
    if (offers.length < 2) return '';
    return '<div class="d-offers"><div class="d-offers-h">판매처별 가격 비교</div>' + offers.map((o, i) =>
      '<a class="offer ' + (i === 0 ? 'best' : '') + '" data-src="' + esc(o.source) + '" href="' + esc(o.href) + '" target="_blank" rel="sponsored noopener nofollow"><span class="o-mall"><i style="background:' + ((META.sources.find(s => s.code === o.source) || {}).color || '#999') + '"></i>' + esc(o.mall) + (o.self ? '' : ' <small>같은 상품</small>') + '</span><span class="o-price">' + (i === 0 ? '<em>최저</em>' : '+' + num(o.price - offers[0].price) + '원 ') + '<b>' + won(o.price) + '</b></span></a>').join('') + '</div>';
  }
  function sparkline(ph) {
    const w = 300, h = 64, vals = ph.map(x => x.price), mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
    const pts = vals.map((v, i) => [i / (vals.length - 1) * w, h - 8 - (v - mn) / sp * (h - 16)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return '<div class="spark-wrap"><span>가격 추이 (최저 ' + won(mn) + ')</span><svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><path class="a" d="' + d + ' L' + w + ' ' + h + ' L0 ' + h + 'Z"/><path class="l" d="' + d + '"/></svg></div>';
  }
  function fillExtras(p) {
    const sheet = $('#detailSheet');
    const ph = (p.priceHistory || []).filter(x => x.price);
    if ($('#dSpark', sheet)) $('#dSpark', sheet).innerHTML = ph.length >= 2 ? sparkline(ph) : '';
    if ($('#dOffers', sheet) && p.offers) $('#dOffers', sheet).innerHTML = offersHtml(p, offersOf(p));
    const rel = $('#dRel', sheet);
    if (rel && (p.related || []).length && !rel.dataset.done) {
      rel.dataset.done = 1;
      rel.innerHTML = '<h4>같은 카테고리 인기 상품</h4><div class="rel">' + p.related.map((r, i) => cardHtml(r, i, { rank: false }).replace('data-open=', 'data-rel=')).join('') + '</div>';
      bindImgs(rel);
    }
  }
  function fillDetail(p) {
    const box = $('#detailScroll');
    box.innerHTML = detailHtml(p);
    bindImgs(box);
    $$('.tp-slot', box).forEach(renderAd);
    box.scrollTop = 0;
    const c = productCache.get(p.id);
    if (c && c.related) fillExtras(c); // 이미 받아온 데이터가 있으면 바로 채움
  }
  const setVT = (el, name) => { if (el) el.style.viewTransitionName = name || ''; };
  const lockScroll = on => { document.documentElement.classList.toggle('lock', on); };

  async function openDetail(id, cardEl) {
    let p = baseOf(id);
    if (!p) { try { p = await getProduct(id); } catch { toast('상품 정보를 불러오지 못했어요'); return; } }
    const wasOpen = !!detailOpen;
    detailOpen = id;
    pushRecent(p);
    track('view', { productId: p.id, source: p.source, category: p.category });
    try {
      if (!wasOpen) { history.pushState({ modal: id }, '', detailUrl(id)); pushedHistory = true; } else history.replaceState({ modal: id }, '', detailUrl(id));
    } catch { pushedHistory = false; }
    document.title = p.title + ' | 또래픽';
    const detail = $('#detail'), sheet = $('#detailSheet');
    const full = getProduct(id).then(d => { if (detailOpen === id) fillExtras(d); return d; }).catch(() => null);
    if (wasOpen) { // 상세 안에서 다른 상품으로
      sheet.classList.remove('swap'); void sheet.offsetWidth; sheet.classList.add('swap');
      fillDetail(p); full.then(d => d && detailOpen === id && fillExtras(d));
      return;
    }
    const thumb = cardEl && $('.thumb', cardEl);
    const show = () => {
      setVT(thumb);
      fillDetail(p);
      detail.hidden = false; detail.classList.remove('closing');
      $('#detailScroll').scrollTop = 0;
      lockScroll(true);
      setVT($('.d-img', sheet), 'pd-img');
    };
    const vis = thumb && (() => { const r = thumb.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })();
    {
      const r1 = vis ? thumb.getBoundingClientRect() : null;
      show(); setVT($('.d-img', sheet));
      if (!reduced) {
        sheet.animate([{ opacity: 0, transform: isMobile() ? 'translateY(60px)' : 'translateY(18px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: isMobile() ? 300 : 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
        const img = $('.d-img', sheet);
        if (r1) { // FLIP: 이미지만 카드 위치에서 확대
          const r2 = img.getBoundingClientRect();
          if (r2.width) img.animate([{ transformOrigin: 'top left', transform: 'translate(' + (r1.left - r2.left) + 'px,' + (r1.top - r2.top) + 'px) scale(' + (r1.width / r2.width) + ')' }, { transformOrigin: 'top left', transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      }
      sheet.focus({ preventScroll: true });
    }
  }
  function closeDetail(fromPop) {
    if (!detailOpen) return;
    const id = detailOpen;
    detailOpen = null;
    const detail = $('#detail'), sheet = $('#detailSheet');
    const card = $('.cat-panel.active .card[data-id="' + id + '"]');
    const thumb = card && $('.thumb', card);
    const r = thumb && thumb.getBoundingClientRect();
    const visible = r && r.bottom > 0 && r.top < innerHeight;
    const hide = () => { detail.hidden = true; lockScroll(false); setVT($('.d-img', sheet)); sheet.style.transform = ''; $('#detailScroll').scrollTop = 0; };
    try {
      if (!fromPop && pushedHistory) { pushedHistory = false; history.back(); }
      else if (!fromPop) history.replaceState(null, '', listUrl());
    } catch { /* file:// 등 */ }
    document.title = META.site.name + ' - ' + META.site.tagline;
    if (!reduced) {
      detail.classList.add('closing');
      sheet.animate([{ opacity: 1, transform: sheet.style.transform || 'none' }, { opacity: 0, transform: isMobile() ? 'translateY(40%)' : 'translateY(14px) scale(.985)' }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)' }).finished.then(() => { hide(); if (visible) card.querySelector('.card-hit')?.focus({ preventScroll: true }); });
    } else hide();
  }
  $('#detail').addEventListener('click', e => {
    if (e.target.closest('[data-dclose]') || e.target.matches('[data-close]')) return closeDetail();
    const rel = e.target.closest('[data-rel]');
    if (rel) { e.preventDefault(); openDetail(+rel.dataset.rel, null); return; }
    const sh = e.target.closest('[data-share]');
    if (sh) {
      const id = +sh.dataset.share, p = productCache.get(id) || itemById(id), url = shareUrl(id);
      track('share', { productId: id });
      copyText(url).then(ok => toast(ok ? '상품 링크를 복사했어요 · 붙여넣기 하면 이 상품이 바로 열려요' : url));
    }
    const out = e.target.closest('.buy, .offer');
    if (out) { if (STATIC && detailOpen) { const p = baseOf(detailOpen); track('click', { productId: detailOpen, source: out.classList.contains('offer') ? (out.dataset.src || p?.source) : p?.source, category: p?.category, slot: out.classList.contains('offer') ? 'offer' : 'detail' }); } flush(); }
  });
  // 모바일: 시트를 아래로 끌어서 닫기
  (() => {
    const sheet = $('#detailSheet'), box = $('#detailScroll');
    let y0 = null, dy = 0;
    sheet.addEventListener('touchstart', e => { if (!isMobile() || box.scrollTop > 0) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
    sheet.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) sheet.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    sheet.addEventListener('touchend', () => { if (y0 === null) return; sheet.style.transition = ''; if (dy > 110) closeDetail(); else sheet.style.transform = ''; y0 = null; });
  })();
  addEventListener('popstate', () => {
    const pid = detailIdFromUrl();
    if (detailOpen && !pid) { pushedHistory = false; closeDetail(true); }
    else if (!detailOpen && pid) openDetail(pid, null);
  });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (tpsCur) return closeTps();
    if (!$('#drawer').hidden) return closeDrawer();
    if (detailOpen) return closeDetail();
    closeSearchSheet();
  });
  // 포커스 트랩
  $('#detail').addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = $$('button, a[href], [tabindex]:not([tabindex="-1"])', $('#detailSheet')).filter(x => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  // ---------- 찜 드로어 / 기획전 ----------
  let drawerTab = 'wish', drawerCustom = null;
  function openDrawer(tab = 'wish', custom = null) {
    drawerTab = tab; drawerCustom = custom;
    $('#drawer').hidden = false; document.documentElement.classList.add('lock');
    $('.seg', $('#drawer')).hidden = !!custom;
    renderDrawer();
  }
  function renderDrawer() {
    $$('.seg button', $('#drawer')).forEach(b => b.classList.toggle('on', b.dataset.tab === drawerTab));
    const list = drawerCustom ? drawerCustom.items : store.get(drawerTab === 'wish' ? 'tp_wish' : 'tp_recent');
    const head = drawerCustom ? `<div style="padding:8px 10px 14px"><b style="font-size:18px">${esc(drawerCustom.title)}</b><div class="s" style="color:var(--ink3);font-size:13px">${esc(drawerCustom.subtitle || '')}</div></div>` : '';
    $('#drawerList').innerHTML = head + (list.length ? list.map(p => `<button class="dl-item" data-dopen="${p.id}"><img src="${esc(p.image || PLACEHOLDER)}" alt="" referrerpolicy="no-referrer"><div><div class="s">${esc(META.sources.find(s => s.code === p.source)?.name || '')} ${p.brand ? '· ' + esc(p.brand) : ''}</div><div class="t">${esc(p.title)}</div><div class="p">${won(p.price)}</div></div></button>`).join('')
      : `<div class="empty"><b>${drawerTab === 'wish' ? '🤍' : '👀'}</b>${drawerTab === 'wish' ? '하트를 눌러 마음에 드는 상품을 모아 보세요' : '최근 본 상품이 없어요'}</div>`);
  }
  const closeDrawer = () => { $('#drawer').hidden = true; if (!detailOpen) document.documentElement.classList.remove('lock'); };
  $('#openWish').onclick = () => openDrawer('wish');
  $('#drawer').addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closeDrawer();
    const t = e.target.closest('[data-tab]'); if (t) { drawerTab = t.dataset.tab; renderDrawer(); return; }
    const o = e.target.closest('[data-dopen]'); if (o) { closeDrawer(); openDetail(+o.dataset.dopen, null); }
  });
  async function renderCurations() {
    const list = META.curations || [];
    const box = $('#curations');
    if (!list.length) return;
    const ids = [...new Set(list.flatMap(c => c.productIds))].slice(0, 200);
    const d = ids.length ? await api('/api/products?ids=' + ids.join(',')).catch(() => ({ items: [] })) : { items: [] };
    const byId = new Map(d.items.map(p => [p.id, p]));
    box.innerHTML = list.map(c => `<button class="cur" data-cur="${c.id}"><h3>${esc(c.title)}</h3><p>${esc(c.subtitle || '')}</p><div class="thumbs">${c.productIds.slice(0, 5).map(id => byId.get(id)).filter(Boolean).map(p => `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer" loading="lazy">`).join('')}</div></button>`).join('');
    box.hidden = false;
    const curAd = $('.tp-slot[data-slot="curation"]'); if (curAd) renderAd(curAd);
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-cur]'); if (!b) return;
      const c = list.find(x => x.id === +b.dataset.cur);
      openDrawer('custom', { title: c.title, subtitle: c.subtitle, items: c.productIds.map(id => byId.get(id)).filter(Boolean) });
    });
  }

  // ---------- 커스텀 셀렉트 (사이트 디자인과 동일한 드롭다운 / 모바일은 하단 시트) ----------
  // 원래 <select> 는 숨겨서 값·change 이벤트를 그대로 쓰고, 보이는 UI만 교체
  const tpsPop = document.createElement('div');
  tpsPop.className = 'tps-pop'; tpsPop.hidden = true; tpsPop.setAttribute('role', 'dialog');
  tpsPop.innerHTML = '<div class="tps-bg" data-tps-close></div><div class="tps-card"><div class="tps-grab"></div><div class="tps-head"><b class="tps-title"></b><button type="button" class="tps-x" data-tps-close aria-label="닫기">×</button></div><div class="tps-search"><input type="search" placeholder="검색" aria-label="목록 검색"></div><ul class="tps-list" role="listbox"></ul></div>';
  document.body.appendChild(tpsPop);
  let tpsCur = null, tpsIdx = -1;
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const optParts = t => { const m = String(t).match(/^(.*?)\s*\((\d[\d,]*)\)$/); return m ? [m[1], m[2]] : [t, '']; };
  function enhanceSelect(sel, { title, searchable } = {}) {
    if (sel._tps) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tps-btn ' + (sel.className || ''); btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', sel.getAttribute('aria-label') || title || '');
    btn.innerHTML = '<span class="tps-val"></span><svg viewBox="0 0 24 24" class="tps-chev"><path d="m6 9 6 6 6-6"/></svg>';
    sel.classList.add('tps-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel.insertAdjacentElement('afterend', btn);
    const update = () => { const o = sel.options[sel.selectedIndex]; $('.tps-val', btn).textContent = o ? optParts(o.textContent)[0] : ''; btn.classList.toggle('set', !!sel.value && sel.value !== 'all' && sel.value !== 'popular'); };
    sel._tps = { btn, update, title, searchable };
    Object.defineProperty(sel, 'value', { configurable: true, get() { return valueDesc.get.call(this); }, set(v) { valueDesc.set.call(this, v); update(); } });
    new MutationObserver(update).observe(sel, { childList: true });
    sel.addEventListener('change', update);
    btn.addEventListener('click', () => (tpsCur === sel ? closeTps() : openTps(sel)));
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openTps(sel); } });
    update();
  }
  function renderTpsList(filter = '') {
    const sel = tpsCur, f = filter.trim().toLowerCase();
    const items = [...sel.options].map((o, i) => ({ o, i })).filter(({ o }) => !f || o.textContent.toLowerCase().includes(f));
    $('.tps-list', tpsPop).innerHTML = items.map(({ o, i }) => { const [name, cnt] = optParts(o.textContent); return '<li role="option" data-i="' + i + '" aria-selected="' + (i === sel.selectedIndex) + '" class="' + (i === sel.selectedIndex ? 'on' : '') + '"><span>' + esc(name) + '</span>' + (cnt ? '<small>' + esc(cnt) + '</small>' : '') + '<svg viewBox="0 0 24 24" class="tps-ck"><path d="m5 12 5 5 9-10"/></svg></li>'; }).join('') || '<li class="tps-empty">검색 결과가 없어요</li>';
    tpsIdx = items.findIndex(x => x.i === sel.selectedIndex);
  }
  function placeTps() {
    const card = $('.tps-card', tpsPop);
    if (isMobile()) { card.style.left = card.style.top = card.style.width = ''; return; }
    const r = tpsCur._tps.btn.getBoundingClientRect();
    const w = Math.max(r.width, 240), left = Math.min(r.left, innerWidth - w - 12);
    const below = innerHeight - r.bottom - 16, maxH = Math.min(420, Math.max(below, 220));
    card.style.width = w + 'px'; card.style.left = left + 'px';
    card.style.top = (below >= 220 ? r.bottom + 8 : Math.max(12, r.top - maxH - 8)) + 'px';
    $('.tps-list', tpsPop).style.maxHeight = (maxH - (tpsCur._tps.searchable ? 56 : 0)) + 'px';
  }
  function openTps(sel) {
    if (tpsCur) closeTps(true);
    tpsCur = sel;
    const many = sel.options.length > 10 || sel._tps.searchable;
    tpsPop.classList.toggle('has-search', !!many);
    $('.tps-title', tpsPop).textContent = sel._tps.title || sel.getAttribute('aria-label') || '';
    $('.tps-search input', tpsPop).value = '';
    renderTpsList();
    tpsPop.hidden = false; tpsPop.classList.remove('out');
    sel._tps.btn.setAttribute('aria-expanded', 'true'); sel._tps.btn.classList.add('open');
    placeTps();
    if (isMobile()) document.documentElement.classList.add('lock');
    requestAnimationFrame(() => { const on = $('.tps-list .on', tpsPop); on && on.scrollIntoView({ block: 'center' }); (many && !isMobile() ? $('.tps-search input', tpsPop) : $('.tps-list', tpsPop)).focus({ preventScroll: true }); });
  }
  function closeTps(instant) {
    if (!tpsCur) return;
    const sel = tpsCur; tpsCur = null;
    sel._tps.btn.setAttribute('aria-expanded', 'false'); sel._tps.btn.classList.remove('open');
    if (!detailOpen && $('#msearch').hidden) document.documentElement.classList.remove('lock');
    if (instant || reduced) { tpsPop.hidden = true; return; }
    tpsPop.classList.add('out');
    setTimeout(() => { if (!tpsCur) tpsPop.hidden = true; tpsPop.classList.remove('out'); }, 180);
    sel._tps.btn.focus({ preventScroll: true });
  }
  function pickTps(i) {
    const sel = tpsCur; if (!sel) return;
    const changed = sel.selectedIndex !== i;
    sel.selectedIndex = i; sel._tps.update();
    closeTps();
    if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  tpsPop.addEventListener('click', e => {
    if (e.target.closest('[data-tps-close]')) return closeTps();
    const li = e.target.closest('li[data-i]'); if (li) pickTps(+li.dataset.i);
  });
  $('.tps-search input', tpsPop).addEventListener('input', e => renderTpsList(e.target.value));
  tpsPop.addEventListener('keydown', e => {
    const lis = $$('.tps-list li[data-i]', tpsPop);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTps(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); tpsIdx = Math.max(0, Math.min(lis.length - 1, tpsIdx + (e.key === 'ArrowDown' ? 1 : -1))); lis.forEach((l, k) => l.classList.toggle('hl', k === tpsIdx)); lis[tpsIdx]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); const l = lis[tpsIdx] || lis[0]; l && pickTps(+l.dataset.i); }
  });
  document.addEventListener('pointerdown', e => { if (tpsCur && !e.target.closest('.tps-card') && !e.target.closest('.tps-btn')) closeTps(); });
  addEventListener('resize', () => tpsCur && placeTps());
  addEventListener('scroll', e => { if (tpsCur && !isMobile() && !(e.target instanceof Element && e.target.closest?.('.tps-list'))) closeTps(true); }, true);

  // ---------- 광고 (AdSense / 개발 중 자리표시) ----------
  const adIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { track('ad_impression', { slot: e.target.dataset.slot }); adIO.unobserve(e.target); } }), { threshold: .5 });
  // 광고 배치 (11/3 사장님 요청): 첫 화면에 상품이 먼저 보이게 상단 배너를 히어로 아래가 아니라 상품 2줄 뒤로 옮김.
  // 목록 사이 광고(infeed)는 상단 배너와 바로 붙지 않게 1줄 이상 띄움.
  function gridCols(grid) {
    const n = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(v => v && v !== 'none').length : 0;
    return n || (isMobile() ? 2 : 5);
  }
  function adAfter(i, cols = 2) {
    const top = META.ads.slots.find(x => x.code === 'top_banner');
    const s = META.ads.slots.find(x => x.code === 'infeed');
    if (!isMobile()) { // PC (11/4 사장님 요청): 상품 10개 안팎마다 광고, 더보기로 늘어나도 계속. 줄이 깨지지 않게 열 수의 배수로 맞춤 (5열=10개, 6열=12개)
      const every = cols * Math.max(1, Math.round(10 / cols));
      if ((i + 1) % every) return '';
      if (top && i + 1 === every) return `<div class="tp-scard tp-top"><div class="tp-slot" data-slot="top_banner"></div></div>`;
      return s ? `<div class="tp-scard"><div class="tp-slot" data-slot="infeed"></div></div>` : '';
    }
    const firstAt = cols * 2;
    if (top && i + 1 === firstAt) return `<div class="tp-scard tp-top"><div class="tp-slot" data-slot="top_banner"></div></div>`;
    return s && s.everyN && (i + 1) % s.everyN === 0 && (i + 1) > firstAt + cols ? `<div class="tp-scard"><div class="tp-slot" data-slot="infeed"></div></div>` : '';
  }
  function refreshAds() {
    if (!META || META.ads?.provider !== 'adfit') return;
    $$('.cat-panel:not(.active) .tp-slot[data-af]').forEach(el => { el.innerHTML = ''; delete el.dataset.af; delete el.dataset.done; });
    $$('.cat-panel.active .tp-slot:not([data-done])').forEach(renderAd);
  }
  window.tpAdfitFail = ins => { const box = ins && ins.closest('.tp-scard, .tp-sw, .tp-slot'); if (box) box.style.display = 'none'; };
  function renderAd(el) {
    if (el.dataset.done) return;
    el.dataset.done = 1;
    const code = el.dataset.slot, slot = META.ads.slots.find(s => s.code === code);
    if (!slot) return;
    if (code === 'top_banner' && el.closest('.tp-sw')) { el.closest('.tp-sw').hidden = true; return; } // 상단 배너는 상품 목록 안(adAfter)에서 표시
    if (code === 'curation') { // 기획전 아래 광고: 모바일 전용, 기획전이 보일 때만
      if (!isMobile()) { el.closest('.tp-sw')?.setAttribute('hidden', ''); return; }
      if ($('#curations')?.hidden) { delete el.dataset.done; return; } // renderCurations 뒤에 다시 호출
    }
    const af = META.ads.provider === 'adfit' && META.ads.adfit && META.ads.adfit[code];
    if (META.ads.provider === 'adfit' && !af) { const box = el.closest('.tp-scard'); box ? box.remove() : el.closest('.tp-sw')?.setAttribute('hidden', ''); return; } // 애드핏 단위가 없는 자리(하단 등)는 비움
    if (af) { // 카카오 애드핏 (애드센스 승인 전). 자리마다 PC용·모바일용 광고단위를 따로 둠
      // 화면에 보이지 않는 옆 카테고리 패널은 광고를 미뤄 둠 (그 패널로 넘어갈 때 refreshAds가 다시 그림)
      if (el.closest('.cat-panel') && !el.closest('.cat-panel.active')) { delete el.dataset.done; return; }
      const mo = isMobile(), cand = mo ? af.mo : af.pc;
      const list = (Array.isArray(cand) ? cand : cand ? [cand] : []).map(x => typeof x === 'string' ? { id: x } : x);
      // 애드핏 운영정책: 한 페이지 광고 4개 초과 금지 → 목록·배너는 3개까지, 상품 상세 하단 1개는 남겨 둠. 같은 단위는 한 페이지에 한 번만
      const usedIds = () => new Set([...document.querySelectorAll('ins.kakao_ad_area')].map(i => i.dataset.adUnit));
      let used = usedIds(), pick = list.find(x => !used.has(x.id));
      if ((!pick || used.size >= (code === 'detail_bottom' ? 4 : 3)) && code === 'infeed') {
        // 더보기로 내려가면 화면 위로 지나간 가장 오래된 목록 광고를 거둬서 새 자리에 다시 씀 → 10개 안팎마다 광고가 이어지되 한 페이지 동시 4개 이하 유지
        const old = [...document.querySelectorAll('.cat-panel.active .tp-slot[data-slot="infeed"][data-af]')].find(s => s.getBoundingClientRect().bottom < 0 && list.some(x => x.id === s.querySelector('ins')?.dataset.adUnit));
        if (old) { old.closest('.tp-scard')?.remove(); used = usedIds(); pick = list.find(x => !used.has(x.id)); }
      }
      if (!pick || used.size >= (code === 'detail_bottom' ? 4 : 3)) { const box = el.closest('.tp-scard'); box ? box.remove() : (el.innerHTML = ''); return; }
      const unit = pick.id, w = pick.w || (mo ? 320 : 728), h = pick.h || (mo ? 100 : 90);
      el.dataset.af = 1;
      el.innerHTML = `<ins class="kakao_ad_area" style="display:none" data-ad-unit="${esc(unit)}" data-ad-width="${w}" data-ad-height="${h}" data-ad-onfail="tpAdfitFail"></ins>`;
      const s = document.createElement('script'); s.async = true; s.src = 'https://t1.kakaocdn.net/kas/static/ba.min.js'; el.appendChild(s);
    } else if (META.ads.client && slot.slot) {
      el.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(META.ads.client)}" data-ad-slot="${esc(slot.slot)}" data-ad-format="${slot.format === 'fluid' ? 'fluid' : 'auto'}" ${slot.format === 'fluid' ? 'data-ad-layout-key="-6t+ed+2i-1n-4w"' : ''} data-full-width-responsive="true"></ins>`;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* */ }
    } else if (/localhost|127\.0\.0\.1/.test(location.hostname) || location.protocol === 'file:' || new URLSearchParams(location.search).has('adpreview')) {
      el.innerHTML = `<div class="tp-sph"><div><b>AD</b> · ${esc(code)} 광고 자리 (AdSense 승인 후 자동 표시)</div></div>`;
    } else return;
    adIO.observe(el);
  }

  // ---------- 테마 ----------
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    const apply = () => { document.documentElement.dataset.theme = next; localStorage.setItem('tp_theme', next); };
    document.startViewTransition && !reduced ? document.startViewTransition(apply) : apply();
  };

  // ---------- 시작 ----------
  async function init() {
    META = await api('/api/meta');
    $('#disclosure').textContent = META.site.disclosure;
    $('#discBar').textContent = META.site.disclosure;
    $('#priceNotice').textContent = META.site.priceNotice;
    $('#footTagline').textContent = META.site.tagline;
    $('#contactLink').href = 'mailto:' + META.site.contact;
    $('#year').textContent = new Date().getFullYear();
    if (META.updatedAt) {
      const d = new Date(META.updatedAt.replace(' ', 'T') + 'Z');
      $('#updatedAt').textContent = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 업데이트 · 상품 ${num(META.sources.reduce((s, x) => s + x.count, 0))}개`;
    }
    if (!META.ages.some(a => a.code === state.age)) state.age = 'all';
    renderAges(); renderSources(); renderCats();
    enhanceSelect($('#searchCat'), { title: '카테고리 선택' });
    enhanceSelect($('#searchBrand'), { title: '쇼핑몰 선택' });
    enhanceSelect($('#sortSel'), { title: '정렬' });
    $('#searchInput').value = state.q; $('#searchClear').hidden = !state.q;
    await loadBrands();
    renderActiveFilters();
    loadKeywords(); renderCurations(); updateWishCount();
    $$('.tp-slot').forEach(renderAd);
    track('pageview', { referrer: document.referrer });
    const deep = window.__OPEN_PRODUCT__?.id || initialDetailId;
    if (deep) { try { history.replaceState(null, '', listUrl()); } catch { /* */ } openDetail(+deep, null); }
  }
  init().catch(e => { console.error(e); $('#catTrack').innerHTML = '<div class="empty"><b>⚠️</b>서비스에 연결하지 못했어요. 잠시 후 새로고침해 주세요.</div>'; });
})();

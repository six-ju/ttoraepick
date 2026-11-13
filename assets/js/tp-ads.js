/* 또래픽 카카오 애드핏: PC 양옆 사이드 광고 + 랭킹·트렌드 본문 중간 광고 (2026-11-04 사장님 요청)
   - 빌드(server/scripts/export-extra.js)가 ad_provider=adfit 일 때만 관리자 제외 모든 공개 페이지 <head>에
     window.TP_ADFIT(config/site.json adfit.units)와 이 파일을 넣음. 애드센스로 바꾸면 자동으로 빠짐
   - 사이드: PC(861px 이상)이고 본문 양옆에 160x600이 본문을 가리지 않고 들어갈 자리가 있을 때만 2개 (모바일·좁은 화면은 없음)
   - 본문 중간(홈 제외): 트렌드는 분야 3개마다, 랭킹은 12위마다. 기존 애드센스 자리가 있으면 그 자리를 씀
   - 애드핏 운영정책: 한 페이지 광고 4개 초과 금지 → 사이드 2개 + 본문 2개 (사이드가 없으면 본문 3개).
     홈은 app.js가 같은 페이지의 애드핏 광고 수(사이드 포함)를 세서 목록·상세 광고를 4개 안으로 맞춤
   - 같은 광고단위는 한 페이지에 한 번만. 광고가 없으면 자리를 접어서 빈 칸이 안 보이게 함 */
(() => {
  'use strict';
  const U = window.TP_ADFIT;
  if (!U || window.__tpAds) return;
  window.__tpAds = 1;
  const MAX = 4, SW = 160, SH = 600, GAP = 24;
  const SRC = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
  const isHome = !!document.getElementById('catViewport');
  const mobile = () => matchMedia('(max-width: 860px)').matches;
  const units = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => (typeof x === 'string' ? { id: x } : x)).filter(x => x && /^DAN-[A-Za-z0-9]+$/.test(x.id));
  const used = () => new Set([...document.querySelectorAll('ins.kakao_ad_area')].map(i => i.dataset.adUnit));
  const fill = (box, u, onfail) => {
    box.innerHTML = `<ins class="kakao_ad_area" style="display:none" data-ad-unit="${u.id}" data-ad-width="${+u.w || 0}" data-ad-height="${+u.h || 0}" data-ad-onfail="${onfail}"></ins>`;
    const s = document.createElement('script'); s.async = true; s.src = SRC; box.appendChild(s);
  };
  window.tpSideFail = ins => { const b = ins && ins.closest('.tp-rail, .tp-mid'); if (b) b.style.display = 'none'; };

  const st = document.createElement('style');
  st.textContent = '.tp-rail{position:fixed;top:96px;width:' + SW + 'px;height:' + SH + 'px;z-index:35;overflow:hidden}' +
    '.tp-mid{margin:20px auto;text-align:center;overflow:hidden;clear:both}.tp-mid ins{margin:0 auto}' +
    '@media (max-width:860px){.tp-rail{display:none!important}}';
  document.head.appendChild(st);

  // ---------- 양옆 사이드 (PC) ----------
  const content = () => document.getElementById('catViewport') || document.querySelector('main') || document.querySelector('.wrap, .container, article');
  const cw = () => { const el = content(); const w = el ? el.getBoundingClientRect().width : 0; return w > 300 ? Math.min(w, innerWidth) : 960; };
  const vw = () => document.documentElement.clientWidth || innerWidth; // 스크롤바 뺀 폭
  const room = () => !mobile() && (vw() - cw()) / 2 >= SW + GAP * 2 && innerHeight >= SH + 120;
  const rails = [];
  let baseTop = 96;
  function placeRails() {
    if (!rails.length) return;
    const ok = room(), w = cw();
    const foot = document.querySelector('footer');
    const fTop = foot ? foot.getBoundingClientRect().top : Infinity;
    const up = fTop - SH - 16;
    const top = up >= 16 ? Math.min(baseTop, up) : baseTop; // 푸터가 올라오면 같이 올라감 (푸터를 덮지 않게). 페이지가 아주 짧으면 그대로
    rails.forEach((r, i) => {
      r.style.display = ok ? '' : 'none';
      r.style.left = Math.round(i ? (vw() + w) / 2 + GAP : (vw() - w) / 2 - GAP - SW) + 'px';
      r.style.top = top + 'px';
    });
  }
  if (room() && used().size + 2 <= MAX) {
    const hd = document.querySelector('header, .topbar');
    if (hd) { const b = hd.getBoundingClientRect().bottom; if (b > 0 && b < 200) baseTop = Math.max(baseTop, Math.round(b) + 16); }
    const have = used(), side = units(U.side && U.side.pc).filter(u => !have.has(u.id)).slice(0, 2);
    if (side.length === 2) {
      side.forEach((u, i) => {
        const r = document.createElement('aside');
        r.className = 'tp-rail ' + (i ? 'tp-rail-r' : 'tp-rail-l');
        r.setAttribute('aria-label', '광고');
        document.body.appendChild(r);
        rails.push(r);
        fill(r, { w: SW, h: SH, ...u }, 'tpSideFail');
      });
      placeRails();
      let raf = 0;
      const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; placeRails(); }); };
      addEventListener('resize', on, { passive: true });
      addEventListener('scroll', on, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(on).observe(document.body); // 상품 목록이 늦게 채워져 페이지 길이가 바뀔 때
    }
  }

  // ---------- 본문 중간: 트렌드·랭킹 페이지만 (홈 목록 광고는 app.js, 소개·문의·정책은 사이드만) ----------
  if (isHome || !/\/(trends|best)\/|\/ranking\.html/.test(location.pathname)) return;
  const n = Math.min(rails.length ? 2 : 3, MAX - used().size);
  if (n <= 0) return;
  const spots = []; // {el, mode: 'replace' | 'before' | 'after'}
  document.querySelectorAll('ins.adsbygoogle').forEach(i => { const p = i.parentElement; if (p && p !== document.body) spots.push({ el: p, mode: 'replace' }); });
  const main = document.querySelector('main') || document.body;
  const h2 = [...main.querySelectorAll('h2')];
  if (h2.length >= 5) h2.forEach((h, i) => { if (i && i % 3 === 0) spots.push({ el: h, mode: 'before' }); }); // 트렌드: 분야 3개마다
  main.querySelectorAll('ol.rank').forEach(ol => { // 랭킹: 순위 목록 묶음(12위 안팎) 끝마다. 목록 중간을 쪼개지 않음
    const nx = ol.nextElementSibling;
    if (ol.children.length >= 8 && !(nx && nx.querySelector && (nx.querySelector('ins.adsbygoogle') || nx.classList.contains('tp-mid')))) spots.push({ el: ol, mode: 'after' });
  });
  const pos = s => s.el;
  spots.sort((a, b) => (pos(a).compareDocumentPosition(pos(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  // 이미 광고 자리가 바로 옆에 있으면 겹치지 않게 거름
  const yOf = s => { const r = s.el.getBoundingClientRect(); return s.mode === 'after' ? r.bottom : r.top; };
  const near = (a, b) => a.el === b.el || Math.abs(yOf(a) - yOf(b)) < 400; // 광고끼리 붙지 않게 (화면 기준 400px 이상 간격)
  const pickSpots = [];
  for (const s of spots) { if (pickSpots.length >= n) break; if (pickSpots.some(p => near(p, s))) continue; pickSpots.push(s); }
  const pool = units(mobile() ? U.mid && U.mid.mo : U.mid && U.mid.pc);
  for (const s of pickSpots) {
    const have = used(), u = pool.find(x => !have.has(x.id));
    if (!u) break;
    let box;
    if (s.mode === 'replace') { box = s.el; box.classList.add('tp-mid'); box.style.minHeight = ''; }
    else {
      box = document.createElement('div');
      box.className = 'tp-mid';
      s.el.insertAdjacentElement(s.mode === 'before' ? 'beforebegin' : 'afterend', box);
    }
    box.setAttribute('aria-label', '광고');
    fill(box, { w: mobile() ? 300 : 728, h: mobile() ? 250 : 90, ...u }, 'tpSideFail');
  }
})();

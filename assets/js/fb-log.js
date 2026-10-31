/* 또래픽 방문 행동 기록 → Firebase Firestore (정적 사이트용)
   - 보안 규칙상 '생성'만 가능하고, 읽기는 관리자(사장님 구글 계정)만 가능
   - 개발 환경(file://, localhost), 자동화 브라우저, 관리자 본인 방문은 기록하지 않음 */
(() => {
  'use strict';
  const C = window.TP_FB;
  if (!C) return;
  const V = '10.12.2';
  let ready = null;
  const init = () => ready || (ready = (async () => {
    const [{ initializeApp, getApps }, fl] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore-lite.js`),
    ]);
    const app = getApps()[0] || initializeApp(C);
    return { db: fl.getFirestore(app), fl };
  })().catch(e => { console.warn('[tp] 기록 모듈 로드 실패', e); return null; }));
  const device = () => /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  const str = (v, n) => String(v).slice(0, n);
  const skip = () => location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || navigator.webdriver || localStorage.getItem('tp_owner') === '1';

  window.TP_LOG = async (events) => {
    if (skip() || !events || !events.length) return;
    const x = await init();
    if (!x) return;
    const { db, fl } = x;
    const col = fl.collection(db, 'events');
    for (const e of events) {
      const d = { t: e.type, ts: fl.serverTimestamp(), d: device() };
      if (e.productId) d.p = Math.round(+e.productId) || 0;
      if (e.source) d.s = str(e.source, 20);
      if (e.category) d.c = str(e.category, 20);
      if (e.age && e.age !== 'all') d.a = str(e.age, 4);
      if (e.query) d.q = str(e.query, 80);
      if (e.resultCount !== undefined && e.resultCount !== null) d.n = Math.round(+e.resultCount) || 0;
      if (e.slot) d.slot = str(e.slot, 30);
      if (e.sid) d.sid = str(e.sid, 40);
      if (e.referrer) d.ref = str(e.referrer, 200);
      fl.addDoc(col, d).catch(() => { /* 규칙 위반·네트워크 오류는 무시 */ });
    }
  };
})();

// ==========================================================================
// AERON — main.js
// Orchestrates: loading screen, navbar, mobile menu, section reveal
// animations, and boots the drone stage system (see droneStage.js) — three
// independent, always-on 3D stages (hero, cinematic, manifesto/"capture"),
// each with its own canvas, static position, and its own slow yaw-only
// spin. There is no separate desktop/mobile drone system any more: the
// same stages run at every viewport width, and only their CSS sizing
// changes per breakpoint.
// ==========================================================================

import { buildWhatsAppUrl } from './utils.js';
import { initWhatsAppPicker } from './whatsappPicker.js';

const PHONE_DISPLAY = '0534 376 88 29';
const PHONE_TEL = 'tel:+905343768829';
const WHATSAPP_PHONE = '905343768829';

// Emre Armağan
const PHONE2_DISPLAY = '0541 523 11 89';
const PHONE2_TEL = 'tel:+905415231189';
const WHATSAPP2_PHONE = '905415231189';
const WHATSAPP2_MESSAGE = 'Merhaba Emre Bey, drone çekimi için sizlere ulaşıyorum.';
const WHATSAPP_MESSAGE = 'Merhaba Mertcan Bey, drone çekimi için sizlere ulaşıyorum.';
const WHATSAPP_URL = buildWhatsAppUrl(WHATSAPP_PHONE, WHATSAPP_MESSAGE);
const WHATSAPP2_URL = buildWhatsAppUrl(WHATSAPP2_PHONE, WHATSAPP2_MESSAGE);

document.addEventListener('DOMContentLoaded', () => {
  injectContactLinks();
  setYear();
  initNavbar();
  initMobileMenu();
  initHeroVideo();
  initManifestoVideo();
  initDronePlaceholder();
  initServiceWorker();
  initRevealAnimations();
  initWhatsAppPicker({
    contacts: [
      { name: 'Mertcan Armağan', url: WHATSAPP_URL, recommended: true },
      { name: 'Emre Armağan', url: WHATSAPP2_URL },
    ],
  });
  initApp();
});

function injectContactLinks() {
  document.querySelectorAll('[data-phone-link]').forEach((el) => (el.href = PHONE_TEL));
  document.querySelectorAll('[data-phone-text]').forEach((el) => (el.textContent = PHONE_DISPLAY));
  document.querySelectorAll('[data-whatsapp-link]').forEach((el) => (el.href = WHATSAPP_URL));
  document.querySelectorAll('[data-phone2-link]').forEach((el) => (el.href = PHONE2_TEL));
  document.querySelectorAll('[data-phone2-text]').forEach((el) => (el.textContent = PHONE2_DISPLAY));
  document.querySelectorAll('[data-whatsapp1-link]').forEach((el) => (el.href = WHATSAPP_URL));
  document.querySelectorAll('[data-whatsapp2-link]').forEach((el) => (el.href = WHATSAPP2_URL));
}

function setYear() {
  const el = document.getElementById('current-year');
  if (el) el.textContent = new Date().getFullYear();
}

// ---------------------------------------------------------------------
// Navbar: transparent at top, frosted after scroll, light text on dark
// section (cinematic) via IntersectionObserver.
// ---------------------------------------------------------------------
function initNavbar() {
  const navbar = document.getElementById('navbar');

  window.addEventListener(
    'scroll',
    () => {
      navbar.classList.toggle('is-scrolled', window.scrollY > 40);
    },
    { passive: true }
  );

  const cinematic = document.getElementById('cinematic');
  if (cinematic && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          navbar.classList.toggle('on-dark', entry.isIntersecting);
        });
      },
      { rootMargin: `-${getComputedNavHeight()}px 0px -70% 0px` }
    );
    io.observe(cinematic);
  }
}

function getComputedNavHeight() {
  return document.getElementById('navbar').offsetHeight || 76;
}

// ---------------------------------------------------------------------
// Mobile menu
// ---------------------------------------------------------------------
function initMobileMenu() {
  const btn = document.getElementById('hamburger');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;

  function closeMenu() {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }
  function openMenu() {
    menu.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
  }

  btn.addEventListener('click', () => {
    const isOpen = menu.classList.contains('is-open');
    isOpen ? closeMenu() : openMenu();
  });

  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

// Smooth scroll artık js/smoothScroll.js içinde (three.js'ten bağımsız).

// ---------------------------------------------------------------------
// Gentle section reveal animations (opacity/translateY), independent of
// the 3D drone stages.
// ---------------------------------------------------------------------
function initRevealAnimations() {
  const targets = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || targets.length === 0) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          entry.target.style.animationDelay = `${(i % 4) * 0.08}s`;
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach((t) => io.observe(t));
}

// ---------------------------------------------------------------------
// Boots the three drone stages and starts a single shared render loop for
// all of them. Simple by design: model load -> model clone (one per
// stage) -> scene -> camera -> light -> fixed position -> slow yaw spin ->
// render.
// ---------------------------------------------------------------------
async function initApp() {
  const loadingScreen = document.getElementById('loading-screen');
  let droneSystem = null;

  // HIZLI YÜKLEME: açılış ekranı 3D modelleri beklemez. Sayfa içeriği hazır
  // olur olmaz (en geç ~700 ms sonra) ekran kalkar; drone arka planda yüklenir.
  const ready = Promise.race([
    (document.fonts && document.fonts.ready) || Promise.resolve(),
    new Promise((r) => setTimeout(r, 700)),
  ]);

  try {
    // 3D modül dinamik yüklenir: three.js/dosya sorunu olsa bile sayfa açılır.
    const { initDroneStages } = await import('./droneStage.js');
    droneSystem = await initDroneStages(); // anında döner, modeller arka planda iner
  } catch (err) {
    console.error('Drone stages failed to start:', err);
  }

  await ready;
  hideLoadingScreen(loadingScreen);
  document.body.classList.add('is-ready');
  playHeroTextIntro();
  if (droneSystem) droneSystem.startHeroIntro();

  // PERFORMANS: (1) 120/144 Hz ekranlarda bile en fazla ~60 kare/sn çizilir (iki kat az GPU işi),
  // (2) ortalama kare süresi uzun kalırsa çözünürlük kademeli düşürülür (1 → 0.85 → 0.7),
  // böylece zayıf telefonlarda kasma yerine hafif bir yumuşama olur.
  const MIN_FRAME_MS = 1000 / 62;
  let lastDraw = 0;
  let sampleStart = 0;
  let sampleFrames = 0;
  let level = 0;
  const LEVELS = [1, 0.85, 0.7];

  function tick(now) {
    requestAnimationFrame(tick);
    if (!droneSystem || document.hidden) { sampleStart = 0; return; }
    if (now - lastDraw < MIN_FRAME_MS) return;
    lastDraw = now;
    droneSystem.render();

    // Kalite izleme: 90 karelik pencerelerle ölç; intro uçuşu sırasındaki ilk 4 sn sayılmaz.
    if (!sampleStart) { sampleStart = now; sampleFrames = 0; return; }
    sampleFrames++;
    if (sampleFrames >= 90) {
      const avg = (now - sampleStart) / sampleFrames;
      sampleStart = now; sampleFrames = 0;
      if (now > 4000 && avg > 26 && level < LEVELS.length - 1) {
        level++;
        if (droneSystem.setQuality) droneSystem.setQuality(LEVELS[level]);
      }
    }
  }
  requestAnimationFrame(tick);
}

function hideLoadingScreen(loadingScreen) {
  if (!loadingScreen) return;
  loadingScreen.classList.add('is-hidden');
  setTimeout(() => loadingScreen.remove(), 600);
}

// ---------------------------------------------------------------------
// Hero text: a plain fade/rise on load. No longer tied to a drone intro
// spin timeline — the drone's own spin is independent and continuous.
// ---------------------------------------------------------------------
function playHeroTextIntro() {
  const items = ['.hero-text .eyebrow', '.hero-title', '.hero-desc', '.hero-cta-group', '.hero-trust'];
  gsap.fromTo(
    items,
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'power2.out' }
  );
}

// ---------------------------------------------------------------------
// Hero arka plan videosu: hero ekrandan çıkınca durur (3D drone + sayfa
// akıcı kalsın), geri gelince devam eder. Otomatik oynatma engellenirse
// sessizce yok sayılır; perde altında sayfa yine düzgün görünür.
// ---------------------------------------------------------------------
function initHeroVideo() {
  initBgVideo(document.querySelector('.hero-bg-video'), document.getElementById('hero'), { lazy: false });
}

// Manifesto (araba çekimi) — hero ile aynı sistem, ama bölüme yaklaşınca yüklenir.
function initManifestoVideo() {
  initBgVideo(document.querySelector('.manifesto-bg-video'), document.getElementById('manifesto'), { lazy: true });
}

// ---------------------------------------------------------------------
// Ağ hızına göre video seçimi.
//   'off'  → veri tasarrufu / 2G: video hiç inmez, sadece poster görünür
//   'low'  → 3G / yavaş hat: daha küçük çözünürlük + düşük kalite sürümü
//   'high' → normal
// Tarayıcı bağlantıyı yanlış bildirebilir (ör. DevTools "3G" taklidi ya da Safari'de hiç
// bilgi yok). Bu yüzden 'high' ile başlayan video, ilk saniyelerde takılırsa OTOMATİK
// olarak küçük sürüme geçer (bkz. watchStall) — karar videonun gerçek davranışına bağlı.
// ---------------------------------------------------------------------
function pickVideoTier(forceSlow) {
  const c = navigator.connection || {};
  if (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || '')) return 'off';
  if (forceSlow || c.effectiveType === '3g' || (c.downlink && c.downlink < 1.5)) return 'low';
  return 'high';
}

// Cloudinary adresinden daha küçük sürüm türet: kalite q_auto:low, genişlik ~%60.
function lowRendition(url) {
  return url
    .replace(/q_auto:\w+/, 'q_auto:low')
    .replace(/w_(\d+)/, (_, w) => 'w_' + Math.max(320, Math.round(w * 0.6)));
}

// Ortak arka plan video sistemi: iOS uyumlu oynatma, ağ hızına göre sürüm, poster, hata olursa
// yedek adres, takılırsa otomatik küçük sürüm, ekrandan çıkınca durur.
// Öncelik sırası: sayfa → drone modeli → hero videosu → (hızlıysa) araba videosu.
// lazy:true → bölüm ekrana ~1 ekran kala yüklenmeye başlar.
function initBgVideo(video, hero, { lazy = false } = {}) {
  if (!video || !hero) return;

  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  // Poster: hero'da HTML'de zaten var (ilk boyamada görünür); lazy videoda bölüme yaklaşınca yüklenir.
  const posterUrl = video.getAttribute('data-poster');
  let posterLoaded = false;
  function loadPoster() {
    if (posterLoaded || !posterUrl) return;
    posterLoaded = true;
    const img = new Image();
    img.onload = () => { video.poster = posterUrl; video.classList.add('has-poster'); };
    img.src = posterUrl;
  }
  if (!lazy) loadPoster();

  let visible = !lazy; // lazy video, görünür olana kadar oynatılmaz
  const play = () => { if (!visible) return; const p = video.play(); if (p && p.catch) p.catch(() => {}); };
  video.addEventListener('playing', () => video.classList.add('is-playing'));

  const small = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
  let started = false;
  let currentSrc = '';

  // 'high' ile başlayan video ilk saniyelerde takılırsa küçük sürüme geç (izlenen yer korunur).
  function watchStall(highSrc) {
    let downgraded = false;
    let waits = 0;
    const downgrade = () => {
      if (downgraded) return;
      downgraded = true;
      const t = video.currentTime || 0;
      const low = lowRendition(highSrc);
      if (low === highSrc) return;
      currentSrc = low;
      video.src = low;
      video.addEventListener('loadedmetadata', () => { try { video.currentTime = t; } catch (_) {} play(); }, { once: true });
      video.load();
    };
    video.addEventListener('waiting', () => { if (++waits >= 2) downgrade(); });
    setTimeout(() => {
      if (downgraded || !visible) return;
      let ahead = 0;
      try { if (video.buffered.length) ahead = video.buffered.end(video.buffered.length - 1) - video.currentTime; } catch (_) {}
      if (video.readyState < 3 || ahead < 1.5) downgrade();
    }, 4000);
  }

  function startVideo(forceSlow) {
    if (started) return;
    started = true;
    const tier = pickVideoTier(forceSlow);
    if (tier === 'off') return; // sadece poster
    let src = (small && video.getAttribute('data-src-mobile')) || video.getAttribute('data-src');
    if (!src) return;
    const highSrc = src;
    if (tier === 'low') src = lowRendition(src);
    currentSrc = src;
    const fallback = video.getAttribute('data-src-fallback');
    video.addEventListener('error', () => {
      if (fallback && video.src !== fallback) { video.src = fallback; video.load(); play(); }
    }, { once: true });
    video.preload = tier === 'low' ? 'metadata' : 'auto';
    video.src = src;
    video.load();
    play();
    if (tier === 'high') watchStall(highSrc);
  }

  // Video yeterince tamponlandıysa (akıcı oynar) diğer parçalara haber ver.
  video.addEventListener('canplaythrough', () => {
    if (!video.dataset.ready) { video.dataset.ready = '1'; window.dispatchEvent(new CustomEvent('havakare:video-ready', { detail: video.className })); }
  });

  if (lazy && 'IntersectionObserver' in window) {
    // Kullanıcı yaklaşırsa hemen başlar. Önceden indirme YALNIZCA hero videosu akıcı
    // oynayabilecek kadar tamponlandıysa (hızlı hat) ve bağlantı 'high' ise yapılır;
    // yavaş hatta bant genişliği hero'ya kalır.
    let done = false;
    const go = (slow) => { if (done) return; done = true; near.disconnect(); loadPoster(); startVideo(slow); };
    const near = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { loadPoster(); go(false); }
    }, { rootMargin: '300px 0px 300px 0px' });
    near.observe(hero);
    window.addEventListener('havakare:video-ready', (e) => {
      if (e.detail && String(e.detail).includes('hero-bg-video') && pickVideoTier(false) === 'high') setTimeout(() => go(false), 1000);
    });
  } else {
    // Hero: drone hazır olunca başla; 12 sn içinde hazır olmadıysa hat yavaştır → küçük sürüm.
    let ready = false;
    window.addEventListener('havakare:hero-ready', () => { ready = true; startVideo(false); }, { once: true });
    setTimeout(() => { if (!ready) startVideo(true); }, 12000);
  }

  const kick = () => { if (video.paused && started) play(); };
  ['touchstart', 'pointerdown', 'scroll', 'click'].forEach((ev) =>
    window.addEventListener(ev, kick, { once: true, passive: true }));
  video.addEventListener('loadeddata', kick);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  if (!('IntersectionObserver' in window)) { visible = true; return; }
  new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      visible = e.isIntersecting;
      if (visible) play(); else video.pause();
    });
  }, { threshold: 0.05 }).observe(hero);
}

// ---------------------------------------------------------------------
// Yavaş internet: 3D drone ~1,2 sn içinde gelmezse yer tutucu görsel belirir (CSS yalnızca
// masaüstünde gösterir); gerçek drone hazır olunca kaybolur.
// ---------------------------------------------------------------------
function initDronePlaceholder() {
  const poster = document.querySelector('.hero-drone-poster');
  if (!poster) return;
  const t = setTimeout(() => poster.classList.add('is-visible'), 1200);
  window.addEventListener('havakare:hero-ready', () => {
    clearTimeout(t);
    poster.classList.remove('is-visible');
    setTimeout(() => poster.remove(), 1000);
  }, { once: true });
}

// ---------------------------------------------------------------------
// Servis worker: tekrar ziyarette model/JS/CSS anında gelir. Sayfanın zaten indirdiği
// dosyalar (HTTP önbelleğinden) SW önbelleğine alınır — ek veri harcanmaz.
// ---------------------------------------------------------------------
function initServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
      const send = () => {
        const urls = performance.getEntriesByType('resource')
          .map((r) => r.name)
          .filter((n) => n.startsWith(location.origin) && /\.(js|css|glb|webp|jpg|png)(\?|$)/.test(n));
        if (reg.active && urls.length) reg.active.postMessage({ type: 'precache', urls });
      };
      // Kritik indirmeler (model, hero videosu) bitmeden SW'ye iş verme.
      window.addEventListener('havakare:video-ready', () => setTimeout(send, 2000), { once: true });
      setTimeout(send, 20000);
    }).catch(() => {});
  }, { once: true });
}

// ==========================================================================
// HAVAKARE — device.js
// Cihaz + ağ profili. iOS, Android ve masaüstü için AYRI teknik ayarlar.
//
// ÖNEMLİ: Burada yalnızca GÖRÜNMEYEN ayarlar değişir — 3D çizim çözünürlüğü,
// kenar yumuşatma, en yüksek kare hızı, video dosyasının piksel genişliği.
// Dronların hareketi, sahneler, yerleşim ve tasarım her cihazda AYNIDIR:
// Android'den, iPhone'dan ya da bilgisayardan girilse de aynı site görünür.
// (Telefon ve masaüstü dron koreografisi ekran GENİŞLİĞİNE göre ayrılır,
// işletim sistemine göre değil — bkz. droneStage.js isMobileViewport.)
// ==========================================================================

const nav = typeof navigator !== 'undefined' ? navigator : {};
const ua = nav.userAgent || '';

// iPadOS 13+ kendini "Macintosh" olarak tanıtır; dokunmatik nokta sayısından ayırt edilir.
const isIPadOS = nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;

/** 'ios' | 'android' | 'desktop' */
export const OS = /iPhone|iPad|iPod/.test(ua) || isIPadOS ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';

/**
 * Ağ kademesi (her çağrıda yeniden okunur; bağlantı sayfa açıkken değişebilir).
 *   'off'  → veri tasarrufu / 2G: arka plan videosu inmez (poster kalır); 3D dron YİNE gelir.
 *   'low'  → 3G / yavaş hat: dron önce iner, video daha küçük dosyayla sonra başlar.
 *   'high' → normal.
 * Safari/iOS bağlantı bilgisi vermez → 'high' kabul edilir; video gerçekten takılırsa
 * main.js (watchStall) kendiliğinden bir kademe küçük dosyaya geçer.
 */
// Test için: adres sonuna ?net=low (yavaş hat) veya ?net=off (veri tasarrufu) eklenirse
// o senaryo taklit edilir. Normal ziyaretçiyi etkilemez.
const NET_OVERRIDE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('net') : null;

export function netTier() {
  if (NET_OVERRIDE === 'low' || NET_OVERRIDE === 'off' || NET_OVERRIDE === 'high') return NET_OVERRIDE;
  const c = nav.connection || {};
  if (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || '')) return 'off';
  if (c.effectiveType === '3g' || (c.downlink && c.downlink < 1.5)) return 'low';
  return 'high';
}

export function isSlowNet() {
  return netTier() !== 'high';
}

// ---- Donanım kademesi ------------------------------------------------------
// Android: Chrome deviceMemory (GB) + çekirdek sayısı verir → gerçek ayrım yapılabilir.
// iOS: Safari bellek bilgisi vermez, çekirdek sayısını da gizler. iPhone GPU'ları güçlü,
//      asıl maliyet 3x ekran yoğunluğu → tek 'mid' profil, çözünürlük tavanı ile korunur.
// Masaüstü: yalnızca çok zayıf makineler (≤2 çekirdek / ≤2 GB) 'low'.
const cores = nav.hardwareConcurrency || 4;
const mem = nav.deviceMemory || 0; // 0 = bilinmiyor

function detectHwTier() {
  if (OS === 'ios') return 'mid';
  if (OS === 'android') {
    if ((mem && mem <= 3) || cores <= 4) return 'low';
    if (mem >= 6 && cores >= 8) return 'high';
    return 'mid';
  }
  if ((mem && mem <= 2) || cores <= 2) return 'low';
  return 'high';
}

/** 'low' | 'mid' | 'high' */
export const HW = detectHwTier();

// ---- 3D (WebGL) ayarları ----------------------------------------------------
//   dpr       — en yüksek çizim yoğunluğu (ekran 3x olsa bile)
//   heroDpr   — hero tuvali kenarlardan taşacak kadar büyük çizilir → daha düşük tavan
//   aa        — MSAA kenar yumuşatma (Apple GPU'larında ucuz, zayıf Android'de pahalı)
//   budget    — tek tuval için en fazla piksel (büyük tuvalde çözünürlük biraz düşer)
//   fps       — 3D çizim tavanı (hareket zaman tabanlı: 30'da da aynı hızda ilerler)
//   power     — hibrit dizüstülerde güçlü ekran kartını iste
const GL_PROFILES = {
  desktop: {
    high: { dpr: 1.5, heroDpr: 1.25, aa: true, budget: 2.4e6, fps: 60, power: 'high-performance' },
    mid: { dpr: 1.25, heroDpr: 1.1, aa: true, budget: 1.6e6, fps: 60, power: 'high-performance' },
    low: { dpr: 1, heroDpr: 1, aa: false, budget: 1.1e6, fps: 60, power: 'default' },
  },
  // Telefon ekranları 2x-3x yoğunlukta: dron 1.25x'te çizilirse büyütülünce pikselli görünür.
  // Telefon tuvalleri artık yalnızca görünen alanı kaplıyor (bkz. droneStage.js fitAndResize),
  // bu yüzden 2x yoğunluk kaldırılabiliyor. 3x ekranda 2x ile fark gözle seçilmez, maliyet
  // %56 daha az.
  ios: {
    high: { dpr: 2, heroDpr: 2, aa: true, budget: 2.4e6, fps: 60, power: 'default' },
    mid: { dpr: 2, heroDpr: 2, aa: true, budget: 2.2e6, fps: 60, power: 'default' },
    low: { dpr: 1.5, heroDpr: 1.5, aa: true, budget: 1.3e6, fps: 30, power: 'default' },
  },
  android: {
    high: { dpr: 2, heroDpr: 2, aa: true, budget: 2.4e6, fps: 60, power: 'high-performance' },
    mid: { dpr: 2, heroDpr: 1.75, aa: true, budget: 1.9e6, fps: 60, power: 'default' },
    low: { dpr: 1.5, heroDpr: 1.5, aa: true, budget: 1.2e6, fps: 30, power: 'default' },
  },
};

export const GL = GL_PROFILES[OS][HW];

// ---- Arka plan videosu ayarları -------------------------------------------
//   maxDpr   — video, ekranda kapladığı alan × bu yoğunluk kadar keskin seçilir
//   maxWidth — en büyük dosya (telefon ekranı için 1920 gereksiz büyük)
// Kalite her zaman q_auto:good: eski "eco" kalite görüntüyü bulanık/sisli yapıyordu.
export const VIDEO = {
  maxDpr: OS === 'desktop' ? 1.5 : 2,
  maxWidth: OS === 'desktop' ? 1920 : HW === 'low' ? 1280 : 1600,
};

// Geliştirme kolaylığı: konsolda window.__havakareDevice ile görülebilir.
if (typeof window !== 'undefined') {
  window.__havakareDevice = { OS, HW, GL, VIDEO, net: netTier() };
}

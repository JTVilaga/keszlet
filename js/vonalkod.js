// vonalkod.js – vonalkód és QR-kód beolvasása a kamerával.
//
// Két út, a futás helye szerint:
// - APK (Android-app): a JT AppKreator „Vonalkódolvasó” bővítménye (window.Capacitor.Plugins.BarcodeScanner).
//   A Google kész olvasó-ablaka nyílik meg; kameraengedély sem kell. Az első használatkor a telefon letölti
//   a Google kódolvasóját (egyszer, internettel).
// - Böngésző (PWA): a böngésző saját felismerője (BarcodeDetector) az élő kameraképen, egy saját ablakban.
//   Androidos Chrome-ban működik; a Windowsos Chrome nem ismeri – ott a kódot kézzel kell beírni.
//
// Használat:  const k = await Vonalkod.olvas();   // { kod: 'szöveg', qr: true/false }, vagy null, ha bezárták az ablakot
//             Vonalkod.elerheto()                    // van-e itt mivel olvasni

const Vonalkod = (() => {
  const apkban = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Kodolvaso = (apkban && window.Capacitor.Plugins && window.Capacitor.Plugins.BarcodeScanner) || null;
  const FORMATUMOK = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'ITF', 'QR_CODE'];
  const WEB_FORMATUMOK = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

  function elerheto() {
    if (Kodolvaso) return true;
    return !apkban && 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // Miért nem lehet itt olvasni (a felhasználónak szóló szöveg).
  function miertNem() {
    if (apkban) return 'Az appban a vonalkódolváshoz a „Vonalkódolvasó” bővítmény kell (JT AppKreator → Bővítmények…).';
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return 'A kamera csak https-címről vagy az appban érhető el.';
    return 'Ez a böngésző nem tud vonalkódot olvasni (Androidon Chrome-ban megy). Írd be a kódot kézzel.';
  }

  async function olvas(uzenet) {
    if (Kodolvaso) return apkOlvas(uzenet || (() => {}));
    if (elerheto()) return webOlvas();
    throw new Error(miertNem());
  }

  // ---------- APK: a Google kódolvasója ----------
  async function apkOlvas(uzenet) {
    const { available } = await Kodolvaso.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      uzenet('A kódolvasó első letöltése… (egyszer kell, internettel)');
      await new Promise((kesz, hiba) => {
        let figyelo = null;
        const vege = fn => { if (figyelo && figyelo.remove) figyelo.remove(); fn(); };
        figyelo = Kodolvaso.addListener('googleBarcodeScannerModuleInstallProgress', e => {
          if (e.state === 4) vege(kesz);   // kész
          else if (e.state === 3 || e.state === 5) vege(() => hiba(new Error('A kódolvasó letöltése nem sikerült. Van internet?')));
          else if (e.progress) uzenet('A kódolvasó letöltése… ' + Math.round(e.progress) + '%');
        });
        Kodolvaso.installGoogleBarcodeScannerModule().catch(err => vege(() => hiba(err)));
      });
    }
    try {
      const { barcodes } = await Kodolvaso.scan({ formats: FORMATUMOK });
      if (!barcodes || !barcodes.length) return null;
      const b = barcodes[0];
      return { kod: String(b.rawValue || b.displayValue || ''), qr: b.format === 'QR_CODE' };
    } catch (e) {
      if (/cancel/i.test(String(e && e.message))) return null;   // az ablak bezárása nem hiba
      throw e;
    }
  }

  // ---------- Böngésző: BarcodeDetector az élő kameraképen ----------
  async function webOlvas() {
    const tamogatott = await BarcodeDetector.getSupportedFormats().catch(() => []);
    const formats = WEB_FORMATUMOK.filter(f => tamogatott.includes(f));
    const detektor = new BarcodeDetector(formats.length ? { formats } : undefined);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      throw new Error(e && e.name === 'NotAllowedError' ? 'Nincs engedély a kamerához.' : 'A kamera nem érhető el.');
    }

    // <dialog> + showModal: így a szerkesztő ablak (szintén dialog) fölé kerül.
    const ablak = document.createElement('dialog');
    ablak.className = 'kodolvaso';
    ablak.innerHTML = '<video playsinline muted></video><div class="kodolvaso-keret"></div>'
      + '<p class="kodolvaso-sugo">Tartsd a vonalkódot a keretbe</p>'
      + '<button type="button" class="gomb kodolvaso-bezar">Mégse</button>';
    document.body.appendChild(ablak);
    ablak.showModal();
    const video = ablak.querySelector('video');
    video.srcObject = stream;
    await video.play().catch(() => {});

    return new Promise(kesz => {
      let fut = true;
      const vege = kod => {
        fut = false;
        stream.getTracks().forEach(t => t.stop());
        if (ablak.open) ablak.close();
        ablak.remove();
        kesz(kod);
      };
      ablak.querySelector('.kodolvaso-bezar').addEventListener('click', () => vege(null));
      ablak.addEventListener('cancel', e => { e.preventDefault(); vege(null); });   // vissza gomb / Esc
      const keres = async () => {
        if (!fut) return;
        try {
          if (video.readyState >= 2) {
            const talalat = await detektor.detect(video);
            if (talalat.length && fut) { if (navigator.vibrate) navigator.vibrate(80); return vege({ kod: talalat[0].rawValue, qr: talalat[0].format === 'qr_code' }); }
          }
        } catch (e) { /* egy-egy képkocka hibája nem baj */ }
        setTimeout(keres, 250);
      };
      keres();
    });
  }

  return { olvas, elerheto, miertNem };
})();

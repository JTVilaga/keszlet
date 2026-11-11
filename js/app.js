// app.js – a felület működése: lista, szerkesztés, mentés/betöltés.

const VERZIO = '1.00';

// Igaz, ha az Android-appban (Capacitor) futunk, hamis a böngészőben.
// A window.Capacitor objektumot az app maga teszi a lapba, böngészőben nem létezik.
function ezApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform());
}

// Rövidítés az elemek eléréséhez
const $ = id => document.getElementById(id);

let tetelek = [];   // a memóriában tartott lista (az IndexedDB másolata)

// ---------- Indítás ----------

document.addEventListener('DOMContentLoaded', async () => {
  $('verzio').textContent = VERZIO;
  $('pwaJel').hidden = ezApp();   // "PWA" felirat csak böngészőben, az appban nem
  esemenyekBekotese();
  await betoltAdatbazisbol();
  serviceWorkerRegisztralas();
});

async function betoltAdatbazisbol() {
  tetelek = await DB.osszes();
  if (!tetelek.length && await mintaBetoltes()) tetelek = await DB.osszes();
  lista();
}

// ---------- Mintaadatok ----------
// Az első indításkor (üres adatbázis) néhány mintatétel kerül be, hogy az app ne üresen induljon.
// Csak egyszer: ha törlöd őket, nem jönnek vissza. A vonalkódok kitalált, de érvényes EAN-13 kódok.
const MINTA_JEL = 'keszlet-minta-betoltve';
const MINTA = [
  { nev: 'Tej 2,8% 1 l',   mennyiseg: 4,   egyseg: 'db', minimum: 2, hely: 'hűtő',   vonalkod: '5999900001017', qrkod: '' },
  { nev: 'Kenyér',          mennyiseg: 1,   egyseg: 'db', minimum: 1, hely: 'kamra',  vonalkod: '5999900002021', qrkod: '' },
  { nev: 'Liszt BL55',      mennyiseg: 2.5, egyseg: 'kg', minimum: 1, hely: 'kamra',  vonalkod: '5999900003035', qrkod: 'KAMRA-POLC-1' },
  { nev: 'Kristálycukor',   mennyiseg: 0.5, egyseg: 'kg', minimum: 1, hely: 'kamra',  vonalkod: '5999900004049', qrkod: 'KAMRA-POLC-2' },
  { nev: 'Őrölt kávé',      mennyiseg: 3,   egyseg: 'db', minimum: 1, hely: 'konyha', vonalkod: '5999900005053', qrkod: '' },
  { nev: 'Elem AA',         mennyiseg: 8,   egyseg: 'db', minimum: 4, hely: 'fiók',   vonalkod: '5999900006067', qrkod: 'FIOK-ELEMEK' }
];
async function mintaBetoltes() {
  try { if (localStorage.getItem(MINTA_JEL)) return false; } catch (e) { return false; }
  const most = new Date().toISOString();
  for (const m of MINTA) await DB.ment(Object.assign({ id: ujAzonosito(), kivetek: [], modositva: most }, m));
  try { localStorage.setItem(MINTA_JEL, most); } catch (e) { /* nem baj */ }
  setTimeout(() => uzenet('Mintaadatok betöltve – szerkeszthetők, törölhetők.'), 300);
  return true;
}

// ---------- Lista megjelenítése ----------

function lista() {
  const szo = $('kereso').value.trim().toLowerCase();
  const csakFogyo = $('csakFogyo').checked;

  const lathato = tetelek
    .filter(t => !szo || t.nev.toLowerCase().includes(szo) || (t.hely || '').toLowerCase().includes(szo)
      || (t.vonalkod || '').toLowerCase().includes(szo) || (t.qrkod || '').toLowerCase().includes(szo))
    .filter(t => !csakFogyo || fogyo(t))
    .sort((a, b) => a.nev.localeCompare(b.nev, 'hu'));

  const ul = $('lista');
  ul.innerHTML = '';
  lathato.forEach(t => ul.appendChild(sorElem(t)));

  $('ures').hidden = tetelek.length > 0;
  const fogyoDb = tetelek.filter(fogyo).length;
  $('osszesito').textContent = tetelek.length
    ? `${tetelek.length} tétel` + (fogyoDb ? ` · ${fogyoDb} fogyóban` : '')
    : '';
}

// Fogyó: van megadott minimum, és a mennyiség el is érte.
function fogyo(t) {
  return t.minimum > 0 && t.mennyiseg <= t.minimum;
}

// Egy listasor felépítése
function sorElem(t) {
  const li = document.createElement('li');
  li.className = 'sor' + (fogyo(t) ? ' sor-fogyo' : '');

  const info = document.createElement('button');
  info.className = 'sor-info';
  info.title = 'Szerkesztés';
  info.innerHTML = `<span class="sor-nev"></span><span class="sor-hely"></span><span class="sor-kod"></span><span class="sor-kivet"></span>`;
  info.querySelector('.sor-kod').textContent = [t.vonalkod ? '▮▯▮ ' + t.vonalkod : '', t.qrkod ? '▦ ' + t.qrkod : ''].filter(Boolean).join('  ·  ');
  info.querySelector('.sor-nev').textContent = t.nev;
  info.querySelector('.sor-hely').textContent =
    (t.hely || '') + (t.minimum > 0 ? ` · min. ${szam(t.minimum)}` : '');
  // Az utolsó kivét (ha volt): mennyiség és időpont
  const utolso = (t.kivetek || []).at(-1);
  info.querySelector('.sor-kivet').textContent = utolso
    ? `utolsó kivét: ${szam(utolso.mennyiseg)} ${t.egyseg || ''} · ${idoRovid(utolso.ido)}`
    : '';
  info.addEventListener('click', () => szerkesztoNyit(t));

  const minusz = gomb('−', 'Csökkentés', () => leptet(t, -1));
  const mennyiseg = document.createElement('span');
  mennyiseg.className = 'sor-mennyiseg';
  mennyiseg.textContent = `${szam(t.mennyiseg)} ${t.egyseg || ''}`;
  const plusz = gomb('+', 'Növelés', () => leptet(t, +1));

  const kivet = document.createElement('button');
  kivet.className = 'gomb gomb-kicsi kivet-gomb';
  kivet.textContent = 'Kivét';
  kivet.title = 'Kivét a raktárból';
  kivet.disabled = !(t.mennyiseg > 0);
  kivet.addEventListener('click', () => kivetNyit(t));

  li.append(info, minusz, mennyiseg, plusz, kivet);
  return li;
}

function gomb(felirat, cim, fn) {
  const b = document.createElement('button');
  b.className = 'kerek';
  b.textContent = felirat;
  b.title = cim;
  b.addEventListener('click', fn);
  return b;
}

// Számok magyar formában (tizedesvessző)
function szam(n) {
  return Number(n).toLocaleString('hu-HU', { maximumFractionDigits: 3 });
}

// Kerekítés 3 tizedesre (pl. 2,3 − 0,1 ne 2,1999999 legyen)
function kerekit(n) {
  return Math.round(n * 1000) / 1000;
}

// Időbélyeg magyar formában: rövid (a sorba) és teljes (a listába)
function idoRovid(iso) {
  return new Date(iso).toLocaleString('hu-HU',
    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function idoTeljes(iso) {
  return new Date(iso).toLocaleString('hu-HU',
    { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---------- Mennyiség léptetése (+ / −) ----------

async function leptet(t, irany) {
  t.mennyiseg = Math.max(0, Number(t.mennyiseg) + irany);
  t.modositva = new Date().toISOString();
  await DB.ment(t);
  lista();
}

// ---------- Kivét ----------
// A kivét csökkenti a készletet, és feljegyzi a tételbe:
//   t.kivetek = [ { mennyiseg: 3, ido: '2026-10-20T20:58:00.000Z' }, ... ]

let kivetTetel = null;   // melyik tételből veszünk ki éppen

function kivetNyit(t) {
  kivetTetel = t;
  $('kivetTetel').textContent = `${t.nev} – készleten: ${szam(t.mennyiseg)} ${t.egyseg || ''}`;
  $('kivetMennyiseg').value = 1;
  $('kivetMennyiseg').max = t.mennyiseg;   // többet nem lehet kivenni, mint amennyi van
  $('kivetAblak').showModal();
  $('kivetMennyiseg').select();
}

async function kivetMentes(e) {
  e.preventDefault();
  const t = kivetTetel;
  const m = Number($('kivetMennyiseg').value);
  if (!t || !(m > 0) || m > t.mennyiseg) return;

  const most = new Date().toISOString();
  t.mennyiseg = kerekit(t.mennyiseg - m);
  t.kivetek = t.kivetek || [];          // régebbi tételeknél még nincs ilyen mező
  t.kivetek.push({ mennyiseg: m, ido: most });
  t.modositva = most;
  await DB.ment(t);

  $('kivetAblak').close();
  lista();
  uzenet(`Kivét: ${szam(m)} ${t.egyseg || ''} ${t.nev}`);
}

// ---------- Szerkesztő ablak ----------

// ujKod: beolvasott, még ismeretlen kód ({ kod, qr }) – az új tétel a megfelelő mezőbe kapja.
function szerkesztoNyit(t, ujKod) {
  const uj = !t;
  $('mezoVonalkod').value  = uj ? (ujKod && !ujKod.qr ? ujKod.kod : '') : (t.vonalkod || '');
  $('mezoQrkod').value     = uj ? (ujKod && ujKod.qr ? ujKod.kod : '') : (t.qrkod || '');
  kodKepFrissit();
  $('urlapCim').textContent = uj ? 'Új tétel' : 'Tétel szerkesztése';
  $('mezoId').value        = uj ? '' : t.id;
  $('mezoNev').value       = uj ? '' : t.nev;
  $('mezoMennyiseg').value = uj ? 0 : t.mennyiseg;
  $('mezoEgyseg').value    = uj ? 'db' : (t.egyseg || '');
  $('mezoMinimum').value   = uj ? 0 : (t.minimum || 0);
  $('mezoHely').value      = uj ? '' : (t.hely || '');
  $('btnTorles').hidden = uj;
  kivetTortenet(uj ? [] : (t.kivetek || []), uj ? '' : (t.egyseg || ''));
  $('szerkeszto').showModal();
  $('mezoNev').focus();
}

// A szerkesztő alján a kivétek listája, a legújabb elöl
function kivetTortenet(kivetek, egyseg) {
  const ul = $('kivetLista');
  ul.innerHTML = '';
  kivetek.slice().reverse().forEach(k => {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><span></span>';
    li.children[0].textContent = idoTeljes(k.ido);
    li.children[1].textContent = `${szam(k.mennyiseg)} ${egyseg}`;
    ul.appendChild(li);
  });
  $('kivetTortenet').hidden = kivetek.length === 0;
}

async function urlapMentes(e) {
  e.preventDefault();
  const id = $('mezoId').value || ujAzonosito();
  const regi = tetelek.find(t => t.id === id);
  const tetel = {
    id,
    nev:       $('mezoNev').value.trim(),
    mennyiseg: Number($('mezoMennyiseg').value) || 0,
    egyseg:    $('mezoEgyseg').value.trim(),
    minimum:   Number($('mezoMinimum').value) || 0,
    hely:      $('mezoHely').value.trim(),
    vonalkod:  $('mezoVonalkod').value.trim(),
    qrkod:     $('mezoQrkod').value.trim(),
    kivetek:   regi ? (regi.kivetek || []) : [],   // a szerkesztés ne törölje a kivéteket
    modositva: new Date().toISOString()
  };
  if (!tetel.nev) return;
  // Ugyanaz a vonalkód két tételen: szólunk (a beolvasás az elsőt találná meg).
  const masik = (tetel.vonalkod && tetelek.find(t => t.id !== id && kodEgyezik(t, tetel.vonalkod)))
    || (tetel.qrkod && tetelek.find(t => t.id !== id && kodEgyezik(t, tetel.qrkod)));
  if (masik && !confirm(`Ez a kód már a(z) „${masik.nev}” tételé.\nÍgy is mentsem?`)) return;

  await DB.ment(tetel);
  const i = tetelek.findIndex(t => t.id === id);
  if (i >= 0) tetelek[i] = tetel; else tetelek.push(tetel);

  $('szerkeszto').close();
  lista();
}

async function tetelTorles() {
  const id = $('mezoId').value;
  const t = tetelek.find(x => x.id === id);
  if (!t || !confirm(`Biztosan törlöd: ${t.nev}?`)) return;
  await DB.torol(id);
  tetelek = tetelek.filter(x => x.id !== id);
  $('szerkeszto').close();
  lista();
}

// Egyedi azonosító: időbélyeg + véletlen rész
function ujAzonosito() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Vonalkód és QR-kód ----------
// A lista feletti „📷 Kód” gomb: beolvasás (vonalkód vagy QR-kód), majd ha van ilyen tétel, gyors műveletek
// (Kivét, +1, Szerkesztés); ha nincs, új tétel ezzel a kóddal (a QR-kód a QR mezőbe, a vonalkód a vonalkód mezőbe).
// A szerkesztőben a mezők melletti „📷” gombok csak az adott mezőt töltik ki.

// Egy tételhez tartozik-e a kód (a vonalkódja vagy a QR-kódja).
const kodEgyezik = (t, kod) => !!kod && (t.vonalkod === kod || t.qrkod === kod);

let talaltTetel = null;

async function kodOlvasas() {
  try {
    return await Vonalkod.olvas(uzenet);
  } catch (hiba) {
    uzenet(hiba.message || String(hiba));
    return null;
  }
}

async function beolvasas() {
  const k = await kodOlvasas();
  if (!k || !k.kod) return;
  const t = tetelek.find(x => kodEgyezik(x, k.kod));
  if (!t) {
    uzenet(k.qr ? 'Új QR-kód – új tétel vele.' : 'Új vonalkód – új tétel vele.');
    szerkesztoNyit(null, k);
    return;
  }
  talaltTetel = t;
  $('talaltTetel').textContent = `${t.nev} – készleten: ${szam(t.mennyiseg)} ${t.egyseg || ''}`;
  $('btnTalaltKivet').disabled = !(t.mennyiseg > 0);
  $('talaltAblak').showModal();
}

// A szerkesztő egyik kódmezőjének kitöltése beolvasással (mezo: 'mezoVonalkod' vagy 'mezoQrkod').
async function mezoBeolvasas(mezo) {
  const k = await kodOlvasas();
  if (k && k.kod) $(mezo).value = k.kod;
}

// ---------- Kódképek és címke ----------
// A szerkesztőben a vonalkód és a QR-kód képe a mezők szövegéből rajzolódik (kodkep.js), gépelés közben is.
// A „🏷️ Címke” egy nyomtatható címkét készít (név, hely, kódok): böngészőben nyomtatható, az appban a JT AppKreator
// „Nyomtatás” bővítményével szintén (a telefon nyomtatási ablaka, „Mentés PDF-be” is; jele: window.jtakNyomtatas),
// enélkül képként menthető (Dokumentumok/Keszlet-cimkek) vagy megosztható (pl. egy nyomtatóappnak).

function kodKepFrissit() {
  $('vonalkodKep').innerHTML = Kodkep.vonalkodSvg($('mezoVonalkod').value);
  $('qrKep').innerHTML = Kodkep.qrSvg($('mezoQrkod').value);
  $('kodKepek').hidden = !$('vonalkodKep').innerHTML && !$('qrKep').innerHTML;
}

// Saját QR-kód: egyedi azonosító a tételnek (pl. KESZLET-LX3K9A2B), ha a terméken nincs kód.
function sajatQr() {
  if ($('mezoQrkod').value.trim() && !confirm('Lecseréljem a mostani QR-kódot egy újra?')) return;
  $('mezoQrkod').value = 'KESZLET-' + ujAzonosito().toUpperCase();
  kodKepFrissit();
}

let cimkeVaszon = null;

function cimkeFajlnev() {
  const nev = $('mezoNev').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tetel';
  return 'cimke-' + nev + '.png';
}

function cimkeNyit() {
  const t = { nev: $('mezoNev').value.trim(), hely: $('mezoHely').value.trim(),
              vonalkod: $('mezoVonalkod').value.trim(), qrkod: $('mezoQrkod').value.trim() };
  if (!t.nev) { uzenet('Előbb add meg a megnevezést.'); return; }
  if (!t.vonalkod && !t.qrkod) { uzenet('A címkéhez kell egy vonalkód vagy QR-kód (a ＋ gomb saját QR-kódot ad).'); return; }
  cimkeVaszon = Kodkep.cimke(t);
  $('cimkeKep').src = cimkeVaszon.toDataURL('image/png');
  $('cimkeAllapot').textContent = '';
  // Az appban (Android WebView) a nyomtatáshoz a Nyomtatás bővítmény kell; nélküle mentés vagy megosztás (pl. nyomtatóappnak).
  $('btnCimkeNyomtat').hidden = ezApp() && !window.jtakNyomtatas;
  $('btnCimkeMegoszt').hidden = ezApp() ? !Capacitor.Plugins.Share : !navigator.canShare;
  $('cimkeAblak').showModal();
}

function cimkeNyomtat() {
  const div = $('nyomtatas');
  div.innerHTML = '';
  const img = new Image();
  img.src = $('cimkeKep').src;
  div.appendChild(img);
  img.onload = () => { window.print(); };
}

async function cimkeMent() {
  const nev = cimkeFajlnev();
  const base64 = $('cimkeKep').src.split(',')[1];
  try {
    if (ezApp()) {
      const { Filesystem } = Capacitor.Plugins;
      if (!Filesystem) throw new Error('A mentéshez a „Fájlmentés” bővítmény kell.');
      await Filesystem.writeFile({ path: 'Keszlet-cimkek/' + nev, data: base64, directory: 'DOCUMENTS', recursive: true });
      $('cimkeAllapot').textContent = '✓ Elmentve: Dokumentumok/Keszlet-cimkek/' + nev;
    } else {
      const a = document.createElement('a');
      a.href = $('cimkeKep').src;
      a.download = nev;
      document.body.appendChild(a);
      a.click();
      a.remove();
      $('cimkeAllapot').textContent = '✓ Letöltve: ' + nev;
    }
  } catch (e) {
    $('cimkeAllapot').textContent = 'Nem sikerült: ' + (e.message || e);
  }
}

async function cimkeMegoszt() {
  const nev = cimkeFajlnev();
  try {
    if (ezApp()) {
      const { Filesystem, Share } = Capacitor.Plugins;
      const irt = await Filesystem.writeFile({ path: nev, data: $('cimkeKep').src.split(',')[1], directory: 'CACHE' });
      await Share.share({ title: nev, files: [irt.uri] });
    } else {
      const blob = await new Promise(kesz => cimkeVaszon.toBlob(kesz, 'image/png'));
      const fajl = new File([blob], nev, { type: 'image/png' });
      if (!navigator.canShare({ files: [fajl] })) throw new Error('Ez a böngésző képet nem tud megosztani – használd a Mentést.');
      await navigator.share({ files: [fajl], title: nev });
    }
  } catch (e) {
    if (e && (e.name === 'AbortError' || /cancel/i.test(String(e.message)))) return;   // bezárta a panelt
    $('cimkeAllapot').textContent = 'Nem sikerült: ' + (e.message || e);
  }
}

// ---------- Mentés és betöltés ----------

async function mentes() {
  if (!tetelek.length) return uzenet('Nincs mit menteni.');
  const eredmeny = await Mentes.kiment(tetelek);
  if (eredmeny === 'megosztva') uzenet('Megosztva.');
  if (eredmeny === 'letoltve')  uzenet('A mentés letöltve.');
}

async function betoltes(e) {
  const fajl = e.target.files[0];
  e.target.value = '';          // hogy ugyanazt a fájlt újra is választhasd
  if (!fajl) return;
  try {
    const ujak = await Mentes.beolvas(fajl);
    if (!confirm(`A fájlban ${ujak.length} tétel van.\nA jelenlegi ${tetelek.length} tétel helyére töltsem be?`)) return;
    await DB.csere(ujak);
    await betoltAdatbazisbol();
    uzenet(`${ujak.length} tétel betöltve.`);
  } catch (hiba) {
    uzenet('Hiba: ' + hiba.message);
  }
}

// ---------- Üzenetsáv ----------

let uzenetIdozito;
function uzenet(szoveg) {
  const el = $('uzenet');
  el.textContent = szoveg;
  el.hidden = false;
  clearTimeout(uzenetIdozito);
  uzenetIdozito = setTimeout(() => el.hidden = true, 3000);
}

// ---------- Események ----------

function esemenyekBekotese() {
  $('kereso').addEventListener('input', lista);
  $('csakFogyo').addEventListener('change', lista);
  $('btnUj').addEventListener('click', () => szerkesztoNyit(null));
  $('urlap').addEventListener('submit', urlapMentes);
  $('btnMegse').addEventListener('click', () => $('szerkeszto').close());
  $('btnTorles').addEventListener('click', tetelTorles);
  $('btnMentes').addEventListener('click', mentes);
  $('btnBetoltes').addEventListener('click', () => $('fajlValaszto').click());
  $('fajlValaszto').addEventListener('change', betoltes);
  $('kivetUrlap').addEventListener('submit', kivetMentes);
  $('btnKivetMegse').addEventListener('click', () => $('kivetAblak').close());
  // Vonalkód
  $('btnBeolvas').addEventListener('click', beolvasas);
  $('btnMezoBeolvas').addEventListener('click', () => mezoBeolvasas('mezoVonalkod').then(kodKepFrissit));
  $('btnMezoQrBeolvas').addEventListener('click', () => mezoBeolvasas('mezoQrkod').then(kodKepFrissit));
  // Kódképek és címke
  $('mezoVonalkod').addEventListener('input', kodKepFrissit);
  $('mezoQrkod').addEventListener('input', kodKepFrissit);
  $('btnQrUj').addEventListener('click', sajatQr);
  $('btnCimke').addEventListener('click', cimkeNyit);
  $('btnCimkeNyomtat').addEventListener('click', cimkeNyomtat);
  $('btnCimkeMent').addEventListener('click', cimkeMent);
  $('btnCimkeMegoszt').addEventListener('click', cimkeMegoszt);
  $('btnCimkeBezar').addEventListener('click', () => $('cimkeAblak').close());
  $('btnTalaltKivet').addEventListener('click', () => { $('talaltAblak').close(); kivetNyit(talaltTetel); });
  $('btnTalaltPlusz').addEventListener('click', async () => {
    $('talaltAblak').close();
    await leptet(talaltTetel, +1);
    uzenet(`+1: ${talaltTetel.nev}`);
  });
  $('btnTalaltSzerk').addEventListener('click', () => { $('talaltAblak').close(); szerkesztoNyit(talaltTetel); });
  $('btnTalaltMegse').addEventListener('click', () => $('talaltAblak').close());
  if (!Vonalkod.elerheto()) $('btnBeolvas').title = Vonalkod.miertNem();
}

// ---------- PWA: service worker és telepítés ----------

function serviceWorkerRegisztralas() {
  if (!('serviceWorker' in navigator)) return;
  if (ezApp()) {
    // Az appban nincs szükség service workerre (a fájlok az APK-ban vannak),
    // ráadásul a régi gyorsítótár elrejtené az új APK fájljait.
    // Ha korábban regisztrálódott, most eltávolítjuk.
    navigator.serviceWorker.getRegistrations()
      .then(lista => lista.forEach(r => r.unregister()));
    return;
  }
  if (location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(h => console.warn('SW hiba:', h));
  }
}

// A böngésző jelzi, hogy telepíthető az app -> megjelenik a Telepítés gomb.
let telepitesEsemeny = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  telepitesEsemeny = e;
  $('btnTelepites').hidden = false;
});
document.addEventListener('DOMContentLoaded', () => {
  $('btnTelepites').addEventListener('click', async () => {
    if (!telepitesEsemeny) return;
    telepitesEsemeny.prompt();
    await telepitesEsemeny.userChoice;
    telepitesEsemeny = null;
    $('btnTelepites').hidden = true;
  });
});

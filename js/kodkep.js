// kodkep.js – vonalkód és QR-kód képe a tárolt szövegből, és a nyomtatható címke.
//
// A kódot nem kell lefényképezni: a beolvasott (vagy beírt) szövegből bármikor újra megrajzolható.
// - Vonalkód: EAN-13 (13 számjegy), UPC-A (12), EAN-8 (8) – ha az ellenőrző jegy stimmel –, minden más Code 128-ként.
// - QR-kód: a js/qrcode.js (Kazuhiko Arase QR Code Generator, MIT-licenc) számolja ki, ékezetekkel (UTF-8).
// Mindkettő SVG-ként (a szerkesztőben) és vásznon (canvas, a címkéhez) is rajzolható.
//
// Használat:  Kodkep.vonalkodSvg('5999900001017')   -> '<svg …>' vagy '' (ha üres)
//             Kodkep.qrSvg('KAMRA-POLC-1')            -> '<svg …>'
//             Kodkep.cimke({ nev, vonalkod, qrkod })  -> <canvas> (PNG-nek menthető, nyomtatható)

const Kodkep = (() => {
  // ---------- EAN / UPC ----------
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = L.map(p => p.replace(/./g, b => (b === '0' ? '1' : '0')));
  const PARITAS = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  // Az EAN ellenőrző jegye stimmel-e (8 és 13 jegyre is jó).
  function eanJo(s) {
    const d = s.split('').map(Number);
    const ell = d.pop();
    const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === ell;
  }
  function ean13(s) {
    const p = PARITAS[+s[0]];
    let b = '101';
    for (let i = 1; i <= 6; i++) b += (p[i - 1] === 'L' ? L : G)[+s[i]];
    b += '01010';
    for (let i = 7; i <= 12; i++) b += R[+s[i]];
    return b + '101';
  }
  function ean8(s) {
    let b = '101';
    for (let i = 0; i < 4; i++) b += L[+s[i]];
    b += '01010';
    for (let i = 4; i < 8; i++) b += R[+s[i]];
    return b + '101';
  }

  // ---------- Code 128 (B készlet: a 32–126 közötti karakterek) ----------
  const C128 = '11011001100 11001101100 11001100110 10010011000 10010001100 10001001100 10011001000 10011000100 10001100100 11001001000 11001000100 11000100100 10110011100 10011011100 10011001110 10111001100 10011101100 10011100110 11001110010 11001011100 11001001110 11011100100 11001110100 11101101110 11101001100 11100101100 11100100110 11101100100 11100110100 11100110010 11011011000 11011000110 11000110110 10100011000 10001011000 10001000110 10110001000 10001101000 10001100010 11010001000 11000101000 11000100010 10110111000 10110001110 10001101110 10111011000 10111000110 10001110110 11101110110 11010001110 11000101110 11011101000 11011100010 11011101110 11101011000 11101000110 11100010110 11101101000 11101100010 11100011010 11101111010 11001000010 11110001010 10100110000 10100001100 10010110000 10010000110 10000101100 10000100110 10110010000 10110000100 10011010000 10011000010 10000110100 10000110010 11000010010 11001010000 11110111010 11000010100 10001111010 10100111100 10010111100 10010011110 10111100100 10011110100 10011110010 11110100100 11110010100 11110010010 11011011110 11011110110 11110110110 10101111000 10100011110 10001011110 10111101000 10111100010 11110101000 11110100010 10111011110 10111101110 11101011110 11110101110 11010000100 11010010000 11010011100'.split(' ');
  const C128_STOP = '1100011101011';
  function code128(s) {
    const kodok = [104];   // Start B
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      kodok.push(c >= 32 && c <= 126 ? c - 32 : 31);   // a nem ábrázolható karakter helyett '?'
    }
    const ell = kodok.reduce((a, k, i) => a + k * (i || 1), 0) % 103;
    return kodok.concat(ell).map(k => C128[k]).join('') + C128_STOP;
  }

  // A vonalkód sávjai ('1' = fekete modul) és a fajtája.
  function savok(szoveg) {
    const s = String(szoveg || '').trim();
    if (!s) return null;
    if (/^\d{13}$/.test(s) && eanJo(s)) return { bitek: ean13(s), fajta: 'EAN-13', szoveg: s };
    if (/^\d{12}$/.test(s) && eanJo('0' + s)) return { bitek: ean13('0' + s), fajta: 'UPC-A', szoveg: s };
    if (/^\d{8}$/.test(s) && eanJo(s)) return { bitek: ean8(s), fajta: 'EAN-8', szoveg: s };
    return { bitek: code128(s), fajta: 'Code 128', szoveg: s };
  }

  // ---------- QR ----------
  function qrMatrix(szoveg) {
    const s = String(szoveg || '').trim();
    if (!s || typeof qrcode !== 'function') return null;
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const q = qrcode(0, 'M');   // 0: a méretet a szöveg hossza adja; M: közepes hibajavítás
    q.addData(s, 'Byte');
    q.make();
    const n = q.getModuleCount();
    const m = [];
    for (let r = 0; r < n; r++) { m.push([]); for (let c = 0; c < n; c++) m[r].push(q.isDark(r, c)); }
    return m;
  }

  // ---------- SVG (a szerkesztőben) ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function vonalkodSvg(szoveg) {
    const v = savok(szoveg);
    if (!v) return '';
    const csend = 10, mag = 50, w = v.bitek.length + 2 * csend;
    let ut = '';
    for (let i = 0; i < v.bitek.length; i++) if (v.bitek[i] === '1') ut += 'M' + (i + csend) + ' 0h1v' + mag + 'h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + (mag + 14) + '" role="img" aria-label="' + esc(v.fajta + ': ' + v.szoveg) + '">'
      + '<rect width="100%" height="100%" fill="#fff"/><path d="' + ut + '" fill="#000"/>'
      + '<text x="' + (w / 2) + '" y="' + (mag + 11) + '" text-anchor="middle" font-family="monospace" font-size="10" fill="#000">' + esc(v.szoveg) + '</text></svg>';
  }

  function qrSvg(szoveg) {
    const m = qrMatrix(szoveg);
    if (!m) return '';
    const n = m.length, k = 4;   // k: csendes zóna (modul)
    let ut = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) ut += 'M' + (c + k) + ' ' + (r + k) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * k) + ' ' + (n + 2 * k) + '" shape-rendering="crispEdges" role="img" aria-label="QR-kód: ' + esc(szoveg) + '">'
      + '<rect width="100%" height="100%" fill="#fff"/><path d="' + ut + '" fill="#000"/></svg>';
  }

  // ---------- Címke (canvas) ----------
  // Fekvő címke: fent a tétel neve, alatta balra a vonalkód, jobbra a QR-kód (ami van).
  function cimke(t) {
    const W = 900, H = 450, M = 30;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
    g.fillStyle = '#000';
    g.font = 'bold 48px system-ui, sans-serif';
    g.textBaseline = 'top';
    let nev = String(t.nev || '');
    while (g.measureText(nev).width > W - 2 * M && nev.length > 1) nev = nev.slice(0, -2) + '…';
    g.fillText(nev, M, M);
    if (t.hely) { g.font = '28px system-ui, sans-serif'; g.fillStyle = '#444'; g.fillText(t.hely, M, M + 58); g.fillStyle = '#000'; }

    const fent = M + 110, alja = H - M;
    const m = qrMatrix(t.qrkod);
    let jobbSzel = W - M;
    if (m) {
      const meret = alja - fent;
      const modul = Math.floor(meret / m.length);
      const qx = W - M - modul * m.length, qy = fent + Math.floor((meret - modul * m.length) / 2);
      for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) if (m[r][c]) g.fillRect(qx + c * modul, qy + r * modul, modul, modul);
      jobbSzel = qx - M;
    }
    const v = savok(t.vonalkod);
    if (v) {
      const szel = jobbSzel - M;
      const modul = Math.max(1, Math.floor(szel / v.bitek.length));
      const bx = M + Math.floor((szel - modul * v.bitek.length) / 2), magas = alja - fent - 44;
      for (let i = 0; i < v.bitek.length; i++) if (v.bitek[i] === '1') g.fillRect(bx + i * modul, fent, modul, magas);
      g.font = '30px monospace'; g.textAlign = 'center';
      g.fillText(v.szoveg, M + szel / 2, fent + magas + 8);
      g.textAlign = 'left';
    }
    if (!m && !v) { g.font = '28px system-ui, sans-serif'; g.fillStyle = '#666'; g.fillText('(nincs kód)', M, fent); }
    return cv;
  }

  return { vonalkodSvg, qrSvg, cimke, savok };
})();

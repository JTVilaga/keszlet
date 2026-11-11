// mentes.js – az adatok kimentése fájlba és visszatöltése.
//
// Ez lesz a Capacitor-tanulás egyik fő pontja: a böngészőben itt
// letöltést (<a download>) és Web Share API-t használunk, az Android-appban
// ezeket a Filesystem és Share bővítmény váltja majd ki.

const Mentes = (() => {
  const FORMATUM = 'keszlet-mentes';

  // A mentési fájl neve dátummal, pl. keszlet-mentes-2026-10-20.json
  function fajlnev() {
    const d = new Date().toISOString().slice(0, 10);
    return `${FORMATUM}-${d}.json`;
  }

  // A tételekből elkészíti a fájl tartalmát (szövegként).
  function tartalom(tetelek) {
    return JSON.stringify({
      formatum: FORMATUM,
      verzio: 1,
      mentve: new Date().toISOString(),
      tetelek
    }, null, 2);
  }

  // Kimentés: ha a rendszer tud fájlt megosztani (Android), megosztást kínál,
  // különben letölti a fájlt (Windows böngésző).
  async function kiment(tetelek) {
    const nev = fajlnev();
	    // 0. út: Android-app (Capacitor) – natív bővítményekkel
        if (ezApp()) return kimentAppban(nev, tartalom(tetelek));
		
    const fajl = new File([tartalom(tetelek)], nev, { type: 'application/json' });

    // 1. út: Web Share API fájllal (Android Chrome, telepített PWA)
    if (navigator.canShare && navigator.canShare({ files: [fajl] })) {
      try {
        await navigator.share({ files: [fajl], title: nev });
        return 'megosztva';
      } catch (e) {
        if (e.name === 'AbortError') return 'megszakitva';
        // más hiba esetén továbbmegyünk a letöltésre
      }
    }

    // 2. út: hagyományos letöltés
    const url = URL.createObjectURL(fajl);
    const a = document.createElement('a');
    a.href = url;
    a.download = nev;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'letoltve';
  }
  // Kimentés az Android-appban (Capacitor):
  // 1. a Filesystem bővítmény az app ideiglenes (cache) mappájába írja a fájlt,
  // 2. a Share bővítmény felkínálja a rendszer megosztási paneljét.
  async function kimentAppban(nev, szoveg) {
    const { Filesystem, Share } = Capacitor.Plugins;
    const irt = await Filesystem.writeFile({
      path: nev,
      data: szoveg,
      directory: 'CACHE',
      encoding: 'utf8'
    });
    try {
      await Share.share({ title: nev, files: [irt.uri] });
      return 'megosztva';
    } catch (e) {
      return 'megszakitva';   // a felhasználó bezárta a panelt
    }
  }
  // Beolvasás: a kiválasztott fájlból visszaadja a tételek tömbjét.
  // Hibát dob, ha a fájl nem ennek az appnak a mentése.
  async function beolvas(fajl) {
    const szoveg = await fajl.text();
    const adat = JSON.parse(szoveg);
    if (adat.formatum !== FORMATUM || !Array.isArray(adat.tetelek)) {
      throw new Error('Ez nem a Készlet app mentési fájlja.');
    }
    return adat.tetelek;
  }

  return { kiment, beolvas };
})();

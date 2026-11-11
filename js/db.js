// db.js – az adatok tárolása a böngésző IndexedDB adatbázisában.
// Egyetlen tároló ("tetelek") van, minden tétel egy objektum:
//   { id, nev, mennyiseg, egyseg, minimum, hely, modositva }

const DB = (() => {
  const DB_NEV = 'keszlet';
  const DB_VERZIO = 1;
  const TAROLO = 'tetelek';
  let kapcsolat = null;

  // Az adatbázis megnyitása (első alkalommal létre is hozza).
  function megnyit() {
    if (kapcsolat) return Promise.resolve(kapcsolat);
    return new Promise((ok, hiba) => {
      const kereses = indexedDB.open(DB_NEV, DB_VERZIO);
      kereses.onupgradeneeded = () => {
        kereses.result.createObjectStore(TAROLO, { keyPath: 'id' });
      };
      kereses.onsuccess = () => { kapcsolat = kereses.result; ok(kapcsolat); };
      kereses.onerror = () => hiba(kereses.error);
    });
  }

  // Segéd: egy művelet lefuttatása a tárolón, Promise-ként.
  async function muvelet(mod, fn) {
    const db = await megnyit();
    return new Promise((ok, hiba) => {
      const tx = db.transaction(TAROLO, mod);
      const eredmeny = fn(tx.objectStore(TAROLO));
      tx.oncomplete = () => ok(eredmeny && eredmeny.result);
      tx.onerror = () => hiba(tx.error);
    });
  }

  return {
    osszes:  ()     => muvelet('readonly',  s => s.getAll()),
    ment:    tetel  => muvelet('readwrite', s => s.put(tetel)),
    torol:   id     => muvelet('readwrite', s => s.delete(id)),
    // Teljes csere (betöltéskor): mindent töröl, majd beírja az új tételeket.
    csere:   tetelek => muvelet('readwrite', s => {
      s.clear();
      tetelek.forEach(t => s.put(t));
    })
  };
})();

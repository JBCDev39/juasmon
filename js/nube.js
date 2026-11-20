// ============================================================
//  La nube de JUASmon: dónde se guardan los reportes y la tabla
//  del Reto del día.
//   1) Si firebase-config.js tiene datos → Firebase (Firestore).
//   2) Si no, y la página corre dentro de Claude → la base de la página.
//   3) Si no hay ninguna → null (todo queda en el dispositivo).
//  Las dos primeras se usan igual: db.collection(ruta).doc(id).set(datos), etc.
// ============================================================
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';

// Envoltorio para que Firestore se use igual que la base de la página.
function wrapFirestore(fs, db) {
  const docsOf = snap => ({ docs: snap.docs.map(d => ({ id: d.id, data: () => d.data() })) });
  const query = (path, parts = []) => ({
    orderBy: (f, dir = 'asc') => query(path, parts.concat(fs.orderBy(f, dir))),
    limit: n => query(path, parts.concat(fs.limit(n))),
    get: async () => docsOf(await fs.getDocs(fs.query(fs.collection(db, path), ...parts))),
  });
  return {
    kind: 'firebase', live: true,
    collection: path => ({
      ...query(path),
      doc: id => ({
        set: data => fs.setDoc(fs.doc(db, path, id), data),
        delete: () => fs.deleteDoc(fs.doc(db, path, id)),
        // Para las salas en línea: leer, cambiar campos y escuchar cambios en vivo.
        get: async () => { const d = await fs.getDoc(fs.doc(db, path, id)); return d.exists() ? d.data() : null; },
        update: data => fs.updateDoc(fs.doc(db, path, id), data),
        watch: (cb, onErr) => fs.onSnapshot(fs.doc(db, path, id), d => cb(d.exists() ? d.data() : null), onErr || (() => {})),
      }),
    }),
  };
}

// Devuelve { db, userId } o { db: null, userId: null }.
export async function connectCloud() {
  // Solo para las pruebas automáticas: una nube de mentira dentro de la página.
  if (window.__JUAS_TEST_DB) return { db: window.__JUAS_TEST_DB, userId: window.__JUAS_TEST_UID || 'test' };
  if (firebaseConfig?.apiKey && firebaseConfig?.projectId) {
    try {
      const [app, auth, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
      ]);
      const fbApp = app.initializeApp(firebaseConfig);
      const a = auth.getAuth(fbApp);
      // Cada dispositivo recibe una identidad anónima (sin cuentas ni contraseñas).
      const cred = await auth.signInAnonymously(a);
      return { db: wrapFirestore(fs, fs.getFirestore(fbApp)), userId: cred.user.uid };
    } catch (e) { console.warn('Firebase no disponible', e); }
  }
  try {
    if (window.claude?.use) {
      const db = await window.claude.use('db');
      let userId = null;
      try { const u = await window.claude.use('user'); userId = u ? await u.id() : null; } catch { }
      if (db) return { db, userId };
    }
  } catch { }
  return { db: null, userId: null };
}

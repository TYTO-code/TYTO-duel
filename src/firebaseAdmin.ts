import admin from "firebase-admin";

// Credenciais: FIREBASE_SERVICE_ACCOUNT (JSON inteiro) ou, na falta dele,
// Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS). Nunca
// commitar o serviceAccountKey.json.
if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  admin.initializeApp(
    serviceAccount
      ? { credential: admin.credential.cert(JSON.parse(serviceAccount)) }
      : undefined
  );
}

export const db = admin.firestore();

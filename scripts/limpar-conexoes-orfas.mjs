/**
 * Limpeza única de `map_connections/duel_*` órfãs: documentos que sobraram de um `duels/{id}` apagado
 * por fora da API (não existe rota de exclusão — só acontece manualmente no console do Firestore).
 * `syncDuelOnMap` nunca é chamado de novo para um duelo que não existe mais, então nada reconcilia
 * essas linhas sozinho; isto resolve o que já ficou preso antes da correção em `src/lib/mapConnection.ts`
 * (que agora apaga a conexão sozinha quando detecta essa situação numa sincronização futura, e grava
 * `expiresAt` para permitir uma política de TTL do Firestore).
 *
 * Roda uma vez, fora de qualquer rota HTTP — zero custo de processamento contínuo. Usa as mesmas
 * credenciais de `src/firebaseAdmin.ts` (`FIREBASE_SERVICE_ACCOUNT` ou Application Default Credentials).
 *
 * Uso:
 *   node scripts/limpar-conexoes-orfas.mjs            # simula (só lista o que apagaria)
 *   node scripts/limpar-conexoes-orfas.mjs --apply     # apaga de verdade
 */
import { db } from "../dist/firebaseAdmin.js";

const apply = process.argv.includes("--apply");

const snapshot = await db.collection("map_connections").where("kind", "==", "duel").get();
let orfas = 0;

for (const doc of snapshot.docs) {
  const duelId = doc.id.replace(/^duel_/, "");
  const duelSnap = await db.collection("duels").doc(duelId).get();
  if (duelSnap.exists) continue;

  orfas++;
  console.log(`${apply ? "apagando" : "órfã (simulação)"}: map_connections/${doc.id} (duelo ${duelId} não existe mais)`);
  if (apply) await doc.ref.delete();
}

console.log(`\n${orfas} conexão(ões) órfã(s) de ${snapshot.size} duelo(s) no mapa${apply ? " — apagadas" : " — rode com --apply para apagar"}.`);

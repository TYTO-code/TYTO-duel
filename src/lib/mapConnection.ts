import admin from "firebase-admin";
import { db } from "../firebaseAdmin";

/**
 * Espelha o duelo no Mapa das Pólis (`map_connections/duel_<id>`): uma linha entre as duas cidades enquanto o
 * desafio durar. O mapa só lê. Melhor esforço — qualquer falha é registrada e engolida, nunca derruba o duelo.
 * Sem nome de pessoa: o documento leva só pontos e estado.
 */

export type MapConnectionState = "pending" | "active" | "ended";

/**
 * Teto de segurança para uma conexão `pending`/`active` sem toque algum (nenhuma ação do duelo chamou
 * `syncDuelOnMap` de novo): se o duelo foi apagado por fora da API (não existe rota de exclusão — só dá
 * para acontecer manualmente no console do Firestore), nada mais nunca vai zerar o estado, e a linha
 * fica no mapa. Renovado a cada sincronização real, então um duelo `disputed` genuíno — que não tem prazo
 * e pode esperar resolução do admin por um tempo — nunca é afetado por isto. Em dias, bem generoso de
 * propósito (ver `.claude/rules/mapa-das-polis.md`: nunca esconder desafio em andamento de verdade).
 */
export const MAP_CONNECTION_TTL_DAYS = 30;

/** `null` = o duelo não aparece no mapa (ex.: status desconhecido). */
export function mapStateForDuel(status: unknown): MapConnectionState | null {
  switch (status) {
    case "pending":
      return "pending";
    case "active":
    case "awaiting_payment":
    case "disputed":
      return "active";
    case "declined":
    case "cancelled":
    case "completed":
      return "ended";
    default:
      return null;
  }
}

export function validPoint(polis: admin.firestore.DocumentData | undefined): { lat: number; lng: number } | null {
  const lat = polis?.lat;
  const lng = polis?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

async function pointOfUser(uid: unknown) {
  if (typeof uid !== "string") return null;
  const user = await db.collection("users").doc(uid).get();
  const polisId = user.data()?.polisId;
  if (typeof polisId !== "string" || !polisId) return { polisId: null, point: null };
  const polis = await db.collection("polis").doc(polisId).get();
  return { polisId, point: validPoint(polis.data()) };
}

function futureExpiry(): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(Date.now() + MAP_CONNECTION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function syncDuelOnMap(duelId: string): Promise<void> {
  try {
    const ref = db.collection("map_connections").doc(`duel_${duelId}`);
    const duelSnap = await db.collection("duels").doc(duelId).get();
    const duel = duelSnap.data();
    if (!duel) {
      // Duelo não existe mais (só sai assim por fora da API — não há rota de exclusão): se sobrou uma
      // conexão órfã dele, apaga, em vez de deixar a linha presa até o prazo de segurança do cliente.
      if ((await ref.get()).exists) await ref.delete();
      return;
    }
    const state = mapStateForDuel(duel.status);
    if (!state) return;

    const FieldValue = admin.firestore.FieldValue;

    if (state === "ended") {
      // Só fecha o que existe (duelo entre a mesma Pólis ou sem coordenadas nunca virou conexão).
      if ((await ref.get()).exists) await ref.update({ state: "ended", endedAt: FieldValue.serverTimestamp() });
      return;
    }

    const existing = await ref.get();
    if (existing.exists) {
      await ref.update({ state, expiresAt: futureExpiry() });
      return;
    }

    const [a, b] = await Promise.all([pointOfUser(duel.challengerId), pointOfUser(duel.opponentId)]);
    if (!a?.point || !b?.point || !a.polisId || a.polisId === b.polisId) return;
    await ref.set({
      kind: "duel",
      state,
      from: a.point,
      to: b.point,
      startedAt: FieldValue.serverTimestamp(),
      endedAt: null,
      expiresAt: futureExpiry(),
    });
  } catch (error) {
    console.error("Mapa: falha ao espelhar duelo (ignorada):", error);
  }
}

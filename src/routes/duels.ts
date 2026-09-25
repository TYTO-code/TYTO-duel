import { Response, Router } from "express";
import admin from "firebase-admin";
import { db } from "../firebaseAdmin";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { HttpError, sendError, sendSuccess } from "../lib/http";

type DuelType = "codigo" | "hacking" | "outro";

type DuelStatus =
  | "pending"
  | "declined"
  | "cancelled"
  | "active"
  | "awaiting_payment"
  | "disputed"
  | "completed";

type NotificationType = "info" | "alert" | "success" | "critical";

interface DuelData {
  challengerId: string;
  challengerName: string;
  challengerPhotoUrl?: string | null;
  opponentId: string;
  opponentName: string;
  opponentPhotoUrl?: string | null;
  type: DuelType;
  customType?: string | null;
  rules: string;
  wagerAmount: number;
  status: DuelStatus;
  reportedWinnerId?: string | null;
  reportedBy?: string | null;
  disputeReason?: string | null;
  winnerId?: string | null;
}

const DUEL_TYPES: DuelType[] = ["codigo", "hacking", "outro"];

const FieldValue = admin.firestore.FieldValue;

const duelsCollection = db.collection("duels");

const router = Router();

router.use(authenticate);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function serializeDuel(doc: admin.firestore.DocumentSnapshot) {
  return { id: doc.id, ...doc.data() };
}

async function readDuel(id: string) {
  return serializeDuel(await duelsCollection.doc(id).get());
}

function getDuelOrThrow(doc: admin.firestore.DocumentSnapshot): DuelData {
  if (!doc.exists) {
    throw new HttpError(404, "Duelo não encontrado.");
  }

  return doc.data() as DuelData;
}

function isParticipant(duel: DuelData, uid: string) {
  return duel.challengerId === uid || duel.opponentId === uid;
}

function otherParticipant(duel: DuelData, uid: string) {
  return duel.challengerId === uid ? duel.opponentId : duel.challengerId;
}

function participantName(duel: DuelData, uid: string) {
  return duel.challengerId === uid ? duel.challengerName : duel.opponentName;
}

function describeDuelType(type: DuelType, customType?: string | null) {
  if (type === "codigo") return "duelo de código";
  if (type === "hacking") return "duelo de hacking";
  return `duelo de ${customType}`;
}

async function isAdmin(uid: string) {
  const userDoc = await db.collection("users").doc(uid).get();
  return userDoc.data()?.admin === true;
}

function notify(
  transaction: admin.firestore.Transaction,
  userId: string,
  title: string,
  message: string,
  type: NotificationType = "info"
) {
  transaction.create(db.collection("notifications").doc(), {
    userId,
    title,
    message,
    type,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Executa uma ação sobre um duelo dentro de uma transação (lê o estado
 * commitado, valida e escreve), e responde com o duelo atualizado.
 */
async function runDuelAction(
  req: AuthenticatedRequest,
  res: Response,
  action: (
    transaction: admin.firestore.Transaction,
    duelRef: admin.firestore.DocumentReference,
    duel: DuelData,
    uid: string
  ) => Promise<void> | void
) {
  const duelId = String(req.params.id);
  const uid = req.uid!;

  try {
    await db.runTransaction(async (transaction) => {
      const duelRef = duelsCollection.doc(duelId);
      const duel = getDuelOrThrow(await transaction.get(duelRef));

      await action(transaction, duelRef, duel, uid);
    });

    return sendSuccess(res, await readDuel(duelId));
  } catch (err) {
    return sendError(res, err);
  }
}

function assertStatus(duel: DuelData, expected: DuelStatus, message: string) {
  if (duel.status !== expected) {
    throw new HttpError(400, message);
  }
}

/** Só quem foi reportado como perdedor pode confirmar/contestar o resultado. */
function assertReportedLoser(duel: DuelData, uid: string) {
  if (!isParticipant(duel, uid) || uid === duel.reportedWinnerId) {
    throw new HttpError(403, "Só quem foi apontado como perdedor pode fazer isso.");
  }
}

function assertWinnerIsParticipant(duel: DuelData, winnerId: unknown): asserts winnerId is string {
  if (!isNonEmptyString(winnerId) || !isParticipant(duel, winnerId)) {
    throw new HttpError(400, "O vencedor precisa ser um dos participantes do duelo.");
  }
}

// ---------------------------------------------------------------------------
// Listagens
// ---------------------------------------------------------------------------

router.get("/", async (req: AuthenticatedRequest, res) => {
  const uid = req.uid!;

  try {
    const [asChallenger, asOpponent] = await Promise.all([
      duelsCollection.where("challengerId", "==", uid).get(),
      duelsCollection.where("opponentId", "==", uid).get(),
    ]);

    const duels = [...asChallenger.docs, ...asOpponent.docs]
      .sort(
        (a, b) =>
          (b.get("createdAt")?.toMillis?.() ?? 0) - (a.get("createdAt")?.toMillis?.() ?? 0)
      )
      .map(serializeDuel);

    return sendSuccess(res, duels);
  } catch (err) {
    return sendError(res, err);
  }
});

router.get("/disputed", async (req: AuthenticatedRequest, res) => {
  try {
    if (!(await isAdmin(req.uid!))) {
      throw new HttpError(403, "Somente o Conselho pode ver os duelos em disputa.");
    }

    const snapshot = await duelsCollection.where("status", "==", "disputed").get();

    const duels = snapshot.docs
      .sort(
        (a, b) =>
          (a.get("createdAt")?.toMillis?.() ?? 0) - (b.get("createdAt")?.toMillis?.() ?? 0)
      )
      .map(serializeDuel);

    return sendSuccess(res, duels);
  } catch (err) {
    return sendError(res, err);
  }
});

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

router.post("/", async (req: AuthenticatedRequest, res) => {
  const challengerId = req.uid!;
  const { opponentId, type, customType, rules, wagerAmount } = req.body ?? {};

  try {
    if (!isNonEmptyString(opponentId)) {
      throw new HttpError(400, "Escolha quem você quer desafiar.");
    }

    if (opponentId === challengerId) {
      throw new HttpError(400, "Você não pode desafiar a si mesmo.");
    }

    if (!DUEL_TYPES.includes(type)) {
      throw new HttpError(400, "Tipo de duelo inválido.");
    }

    if (type === "outro" && !isNonEmptyString(customType)) {
      throw new HttpError(400, "Descreva o tipo do duelo.");
    }

    if (!isNonEmptyString(rules)) {
      throw new HttpError(400, "Defina as regras do duelo.");
    }

    if (!Number.isInteger(wagerAmount) || wagerAmount <= 0) {
      throw new HttpError(400, "A aposta precisa ser um número inteiro de Dracmas maior que zero.");
    }

    const duelRef = duelsCollection.doc();

    await db.runTransaction(async (transaction) => {
      const challengerRef = db.collection("users").doc(challengerId);
      const opponentRef = db.collection("users").doc(opponentId);

      const challenger = await transaction.get(challengerRef);
      const opponent = await transaction.get(opponentRef);

      if (!challenger.exists) {
        throw new HttpError(400, "Seu perfil não foi encontrado.");
      }

      if (!opponent.exists) {
        throw new HttpError(400, "O membro desafiado não foi encontrado.");
      }

      const balance = challenger.data()?.dracmas ?? 0;

      if (wagerAmount > balance) {
        throw new HttpError(400, "Você não pode apostar mais Dracmas do que tem.");
      }

      const challengerName = challenger.data()?.name ?? "Membro";
      const normalizedCustomType = type === "outro" ? customType.trim() : null;

      transaction.create(duelRef, {
        challengerId,
        challengerName,
        challengerPhotoUrl: challenger.data()?.photoUrl ?? null,
        opponentId,
        opponentName: opponent.data()?.name ?? "Membro",
        opponentPhotoUrl: opponent.data()?.photoUrl ?? null,
        type,
        customType: normalizedCustomType,
        rules: rules.trim(),
        wagerAmount,
        status: "pending",
        reportedWinnerId: null,
        reportedBy: null,
        disputeReason: null,
        winnerId: null,
        createdAt: FieldValue.serverTimestamp(),
        respondedAt: null,
        resultReportedAt: null,
        resolvedAt: null,
      });

      notify(
        transaction,
        opponentId,
        "Novo desafio de duelo",
        `${challengerName} te desafiou para um ${describeDuelType(type, normalizedCustomType)}, apostando ${wagerAmount} Ð.`
      );
    });

    return sendSuccess(res, await readDuel(duelRef.id), 201);
  } catch (err) {
    return sendError(res, err);
  }
});

// ---------------------------------------------------------------------------
// Resposta ao desafio
// ---------------------------------------------------------------------------

router.post("/:id/accept", (req: AuthenticatedRequest, res) =>
  runDuelAction(req, res, (transaction, duelRef, duel, uid) => {
    if (duel.opponentId !== uid) {
      throw new HttpError(403, "Só quem foi desafiado pode aceitar o duelo.");
    }

    assertStatus(duel, "pending", "Este duelo não está mais aguardando resposta.");

    transaction.update(duelRef, {
      status: "active",
      respondedAt: FieldValue.serverTimestamp(),
    });

    notify(
      transaction,
      duel.challengerId,
      "Desafio aceito",
      `${duel.opponentName} aceitou seu desafio. Que vença o melhor.`
    );
  })
);

router.post("/:id/decline", (req: AuthenticatedRequest, res) =>
  runDuelAction(req, res, (transaction, duelRef, duel, uid) => {
    if (duel.opponentId !== uid) {
      throw new HttpError(403, "Só quem foi desafiado pode recusar o duelo.");
    }

    assertStatus(duel, "pending", "Este duelo não está mais aguardando resposta.");

    transaction.update(duelRef, {
      status: "declined",
      respondedAt: FieldValue.serverTimestamp(),
    });

    notify(
      transaction,
      duel.challengerId,
      "Desafio recusado",
      `${duel.opponentName} recusou seu desafio.`
    );
  })
);

router.post("/:id/cancel", (req: AuthenticatedRequest, res) =>
  runDuelAction(req, res, (transaction, duelRef, duel, uid) => {
    if (duel.challengerId !== uid) {
      throw new HttpError(403, "Só quem desafiou pode cancelar o duelo.");
    }

    assertStatus(duel, "pending", "Só é possível cancelar um duelo que ainda não foi respondido.");

    transaction.update(duelRef, {
      status: "cancelled",
      respondedAt: FieldValue.serverTimestamp(),
    });
  })
);

// ---------------------------------------------------------------------------
// Resultado e pagamento
// ---------------------------------------------------------------------------

router.post("/:id/report-result", (req: AuthenticatedRequest, res) =>
  runDuelAction(req, res, (transaction, duelRef, duel, uid) => {
    const { winnerId } = req.body ?? {};

    if (!isParticipant(duel, uid)) {
      throw new HttpError(403, "Só os participantes podem reportar o resultado do duelo.");
    }

    assertStatus(duel, "active", "Só é possível reportar o resultado de um duelo em andamento.");
    assertWinnerIsParticipant(duel, winnerId);

    transaction.update(duelRef, {
      reportedWinnerId: winnerId,
      reportedBy: uid,
      status: "awaiting_payment",
      resultReportedAt: FieldValue.serverTimestamp(),
    });

    notify(
      transaction,
      otherParticipant(duel, winnerId),
      "Resultado do duelo reportado",
      `${participantName(duel, winnerId)} foi reportado(a) como vencedor(a) do duelo. Confirme o resultado para pagar a aposta, ou conteste se discordar.`
    );
  })
);

router.post("/:id/confirm", (req: AuthenticatedRequest, res) =>
  runDuelAction(req, res, async (transaction, duelRef, duel, uid) => {
    assertReportedLoser(duel, uid);
    assertStatus(duel, "awaiting_payment", "Este duelo não está aguardando pagamento.");

    const loserId = uid;
    const winnerId = duel.reportedWinnerId!;
    const amount = duel.wagerAmount;

    const loserRef = db.collection("users").doc(loserId);
    const winnerRef = db.collection("users").doc(winnerId);

    const loser = await transaction.get(loserRef);
    const winner = await transaction.get(winnerRef);

    if (!loser.exists || !winner.exists) {
      throw new HttpError(400, "Não foi possível encontrar os participantes do duelo.");
    }

    const loserBalance = loser.data()?.dracmas ?? 0;

    if (loserBalance < amount) {
      throw new HttpError(400, "Saldo insuficiente para pagar a aposta.");
    }

    transaction.update(loserRef, {
      dracmas: FieldValue.increment(-amount),
    });

    transaction.update(winnerRef, {
      dracmas: FieldValue.increment(amount),
    });

    transaction.update(db.collection("public_users").doc(loserId), {
      dracmas: FieldValue.increment(-amount),
    });

    transaction.update(db.collection("public_users").doc(winnerId), {
      dracmas: FieldValue.increment(amount),
    });

    transaction.create(db.collection("transactions").doc(), {
      type: "duel_payout",
      fromId: loserId,
      toId: winnerId,
      amount,
      duelId: duelRef.id,
      timestamp: FieldValue.serverTimestamp(),
    });

    transaction.update(duelRef, {
      status: "completed",
      winnerId,
      resolvedAt: FieldValue.serverTimestamp(),
    });

    notify(
      transaction,
      winnerId,
      "Aposta recebida",
      `Você venceu o duelo e recebeu ${amount} Ð.`,
      "success"
    );
  })
);

router.post("/:id/dispute", (req: AuthenticatedRequest, res) =>
  runDuelAction(req, res, (transaction, duelRef, duel, uid) => {
    const { reason } = req.body ?? {};

    assertReportedLoser(duel, uid);
    assertStatus(duel, "awaiting_payment", "Só é possível contestar um resultado aguardando pagamento.");

    // Depois do /resolve o resultado foi arbitrado pelo Conselho
    // (reportedBy: null) — contestar de novo só criaria um ciclo infinito.
    if (!duel.reportedBy) {
      throw new HttpError(400, "Este resultado já foi decidido pelo Conselho e não pode ser contestado.");
    }

    if (!isNonEmptyString(reason)) {
      throw new HttpError(400, "Explique por que você está contestando o resultado.");
    }

    transaction.update(duelRef, {
      status: "disputed",
      disputeReason: reason.trim(),
    });

    notify(
      transaction,
      duel.reportedBy,
      "Resultado contestado",
      "O resultado do duelo foi contestado e será analisado pelo Conselho."
    );
  })
);

// ---------------------------------------------------------------------------
// Arbitragem do Conselho
// ---------------------------------------------------------------------------

router.post("/:id/resolve", async (req: AuthenticatedRequest, res) => {
  try {
    if (!(await isAdmin(req.uid!))) {
      throw new HttpError(403, "Somente o Conselho pode resolver disputas.");
    }
  } catch (err) {
    return sendError(res, err);
  }

  return runDuelAction(req, res, (transaction, duelRef, duel) => {
    const { winnerId } = req.body ?? {};

    assertStatus(duel, "disputed", "Este duelo não está em disputa.");
    assertWinnerIsParticipant(duel, winnerId);

    const loserId = otherParticipant(duel, winnerId);
    const winnerName = participantName(duel, winnerId);

    transaction.update(duelRef, {
      reportedWinnerId: winnerId,
      reportedBy: null,
      disputeReason: null,
      status: "awaiting_payment",
      resultReportedAt: FieldValue.serverTimestamp(),
    });

    notify(
      transaction,
      winnerId,
      "Disputa resolvida",
      "O Conselho confirmou sua vitória no duelo."
    );

    notify(
      transaction,
      loserId,
      "Disputa resolvida",
      `O Conselho decidiu que ${winnerName} venceu o duelo. Confirme o pagamento da aposta.`
    );
  });
});

export default router;

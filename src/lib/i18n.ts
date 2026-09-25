import { Request } from "express";
import { db } from "../firebaseAdmin";

export type Locale = "pt" | "en" | "es";

const messages = {
  pt: {
    notAuthenticated: "Você precisa estar autenticado.",
    sessionExpired: "Sua sessão expirou. Entre novamente.",
    routeNotFound: "Rota não encontrada.",
    invalidRequest: "Dados da requisição inválidos.",
    internalError: "Algo deu errado no servidor. Tente novamente em instantes.",
    duelNotFound: "Duelo não encontrado.",
    onlyReportedLoser: "Só quem foi apontado como perdedor pode fazer isso.",
    winnerMustBeParticipant: "O vencedor precisa ser um dos participantes do duelo.",
    disputedOnlyCouncil: "Somente o Conselho pode ver os duelos em disputa.",
    chooseOpponent: "Escolha quem você quer desafiar.",
    cannotChallengeSelf: "Você não pode desafiar a si mesmo.",
    invalidDuelType: "Tipo de duelo inválido.",
    describeDuelType: "Descreva o tipo do duelo.",
    defineRules: "Defina as regras do duelo.",
    invalidWager: "A aposta precisa ser um número inteiro de Dracmas maior que zero.",
    profileNotFound: "Seu perfil não foi encontrado.",
    opponentNotFound: "O membro desafiado não foi encontrado.",
    wagerExceedsBalance: "Você não pode apostar mais Dracmas do que tem.",
    onlyOpponentAccepts: "Só quem foi desafiado pode aceitar o duelo.",
    onlyOpponentDeclines: "Só quem foi desafiado pode recusar o duelo.",
    notPendingAnymore: "Este duelo não está mais aguardando resposta.",
    onlyChallengerCancels: "Só quem desafiou pode cancelar o duelo.",
    cancelOnlyPending: "Só é possível cancelar um duelo que ainda não foi respondido.",
    onlyParticipantsReport: "Só os participantes podem reportar o resultado do duelo.",
    reportOnlyActive: "Só é possível reportar o resultado de um duelo em andamento.",
    notAwaitingPayment: "Este duelo não está aguardando pagamento.",
    participantsNotFound: "Não foi possível encontrar os participantes do duelo.",
    insufficientBalance: "Saldo insuficiente para pagar a aposta.",
    disputeOnlyAwaitingPayment: "Só é possível contestar um resultado aguardando pagamento.",
    alreadyDecidedByCouncil: "Este resultado já foi decidido pelo Conselho e não pode ser contestado.",
    explainDispute: "Explique por que você está contestando o resultado.",
    notDisputed: "Este duelo não está em disputa.",
    resolveOnlyCouncil: "Somente o Conselho pode resolver disputas.",
  },
  en: {
    notAuthenticated: "You need to be signed in.",
    sessionExpired: "Your session has expired. Please sign in again.",
    routeNotFound: "Route not found.",
    invalidRequest: "Invalid request data.",
    internalError: "Something went wrong on the server. Please try again shortly.",
    duelNotFound: "Duel not found.",
    onlyReportedLoser: "Only the member reported as the loser can do this.",
    winnerMustBeParticipant: "The winner must be one of the duel's participants.",
    disputedOnlyCouncil: "Only the Council can see disputed duels.",
    chooseOpponent: "Choose who you want to challenge.",
    cannotChallengeSelf: "You can't challenge yourself.",
    invalidDuelType: "Invalid duel type.",
    describeDuelType: "Describe the duel type.",
    defineRules: "Set the duel rules.",
    invalidWager: "The wager must be a whole number of Dracmas greater than zero.",
    profileNotFound: "Your profile was not found.",
    opponentNotFound: "The challenged member was not found.",
    wagerExceedsBalance: "You can't wager more Dracmas than you have.",
    onlyOpponentAccepts: "Only the challenged member can accept the duel.",
    onlyOpponentDeclines: "Only the challenged member can decline the duel.",
    notPendingAnymore: "This duel is no longer awaiting a response.",
    onlyChallengerCancels: "Only the challenger can cancel the duel.",
    cancelOnlyPending: "You can only cancel a duel that hasn't been answered yet.",
    onlyParticipantsReport: "Only the participants can report the duel result.",
    reportOnlyActive: "You can only report the result of an ongoing duel.",
    notAwaitingPayment: "This duel is not awaiting payment.",
    participantsNotFound: "The duel's participants could not be found.",
    insufficientBalance: "Insufficient balance to pay the wager.",
    disputeOnlyAwaitingPayment: "You can only dispute a result that is awaiting payment.",
    alreadyDecidedByCouncil: "This result was already decided by the Council and can't be disputed.",
    explainDispute: "Explain why you are disputing the result.",
    notDisputed: "This duel is not in dispute.",
    resolveOnlyCouncil: "Only the Council can resolve disputes.",
  },
  es: {
    notAuthenticated: "Necesitas iniciar sesión.",
    sessionExpired: "Tu sesión expiró. Inicia sesión de nuevo.",
    routeNotFound: "Ruta no encontrada.",
    invalidRequest: "Datos de la solicitud inválidos.",
    internalError: "Algo salió mal en el servidor. Inténtalo de nuevo en unos instantes.",
    duelNotFound: "Duelo no encontrado.",
    onlyReportedLoser: "Solo quien fue señalado como perdedor puede hacer esto.",
    winnerMustBeParticipant: "El ganador debe ser uno de los participantes del duelo.",
    disputedOnlyCouncil: "Solo el Consejo puede ver los duelos en disputa.",
    chooseOpponent: "Elige a quién quieres desafiar.",
    cannotChallengeSelf: "No puedes desafiarte a ti mismo.",
    invalidDuelType: "Tipo de duelo inválido.",
    describeDuelType: "Describe el tipo de duelo.",
    defineRules: "Define las reglas del duelo.",
    invalidWager: "La apuesta debe ser un número entero de Dracmas mayor que cero.",
    profileNotFound: "No se encontró tu perfil.",
    opponentNotFound: "No se encontró al miembro desafiado.",
    wagerExceedsBalance: "No puedes apostar más Dracmas de los que tienes.",
    onlyOpponentAccepts: "Solo quien fue desafiado puede aceptar el duelo.",
    onlyOpponentDeclines: "Solo quien fue desafiado puede rechazar el duelo.",
    notPendingAnymore: "Este duelo ya no está esperando respuesta.",
    onlyChallengerCancels: "Solo quien desafió puede cancelar el duelo.",
    cancelOnlyPending: "Solo puedes cancelar un duelo que aún no fue respondido.",
    onlyParticipantsReport: "Solo los participantes pueden reportar el resultado del duelo.",
    reportOnlyActive: "Solo puedes reportar el resultado de un duelo en curso.",
    notAwaitingPayment: "Este duelo no está esperando el pago.",
    participantsNotFound: "No se encontraron los participantes del duelo.",
    insufficientBalance: "Saldo insuficiente para pagar la apuesta.",
    disputeOnlyAwaitingPayment: "Solo puedes impugnar un resultado que esté esperando el pago.",
    alreadyDecidedByCouncil: "Este resultado ya fue decidido por el Consejo y no puede impugnarse.",
    explainDispute: "Explica por qué impugnas el resultado.",
    notDisputed: "Este duelo no está en disputa.",
    resolveOnlyCouncil: "Solo el Consejo puede resolver disputas.",
  },
} satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof typeof messages.pt;

export function t(locale: Locale, key: MessageKey) {
  return messages[locale][key];
}

function matchLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("pt")) return "pt";
  if (normalized.startsWith("es")) return "es";
  return null;
}

/**
 * Mesma regra do frontend (useTranslation): `users/{uid}.locale` se for pt/es,
 * senão o idioma principal do navegador (Accept-Language), senão inglês.
 */
export async function resolveLocale(req: Request & { uid?: string }): Promise<Locale> {
  if (req.uid) {
    try {
      const fromProfile = matchLocale((await db.collection("users").doc(req.uid).get()).get("locale"));
      if (fromProfile) return fromProfile;
    } catch {
      // cai para o idioma do navegador
    }
  }

  return matchLocale(req.headers["accept-language"]?.split(",")[0]) ?? "en";
}

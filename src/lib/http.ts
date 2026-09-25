import { Request, Response } from "express";
import { MessageKey, resolveLocale, t } from "./i18n";

/** Erro de regra de negócio: status HTTP + chave da mensagem (traduzida na resposta). */
export class HttpError extends Error {
  constructor(public status: number, public key: MessageKey) {
    super(key);
  }
}

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

/** Responde o erro no idioma do usuário (ver resolveLocale). */
export async function sendError(req: Request, res: Response, error: unknown) {
  const locale = await resolveLocale(req);

  if (error instanceof HttpError) {
    return res.status(error.status).json({ success: false, message: t(locale, error.key) });
  }

  console.error(error);

  return res.status(500).json({ success: false, message: t(locale, "internalError") });
}

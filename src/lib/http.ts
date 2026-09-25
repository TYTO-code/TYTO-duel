import { Response } from "express";

/** Erro de regra de negócio com status HTTP e mensagem em pt-BR para o usuário. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function sendError(res: Response, error: unknown) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    message: "Algo deu errado no servidor. Tente novamente em instantes.",
  });
}

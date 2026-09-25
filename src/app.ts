import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import duelRoutes from "./routes/duels";

export function createApp() {
  const app = express();

  const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim());

  app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
  app.use(express.json());

  app.use("/api/duels", duelRoutes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, message: "Rota não encontrada." });
  });

  // JSON malformado no body e qualquer erro que escape das rotas.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ success: false, message: "Dados da requisição inválidos." });
    }

    console.error(err);

    res.status(500).json({
      success: false,
      message: "Algo deu errado no servidor. Tente novamente em instantes.",
    });
  });

  return app;
}

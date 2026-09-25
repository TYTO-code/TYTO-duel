import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import duelRoutes from "./routes/duels";
import { resolveLocale, t } from "./lib/i18n";

export function createApp() {
  const app = express();

  const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim());

  app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
  app.use(express.json());

  app.use("/api/duels", duelRoutes);

  app.use(async (req: Request, res: Response) => {
    res.status(404).json({ success: false, message: t(await resolveLocale(req), "routeNotFound") });
  });

  // JSON malformado no body e qualquer erro que escape das rotas.
  app.use(async (err: any, req: Request, res: Response, _next: NextFunction) => {
    const locale = await resolveLocale(req);

    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ success: false, message: t(locale, "invalidRequest") });
    }

    console.error(err);

    res.status(500).json({ success: false, message: t(locale, "internalError") });
  });

  return app;
}

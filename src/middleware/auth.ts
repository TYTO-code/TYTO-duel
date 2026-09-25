import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";

export interface AuthenticatedRequest extends Request {
  uid?: string;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Você precisa estar autenticado.",
      });
    }

    const token = authHeader.split("Bearer ")[1];

    const decoded = await admin.auth().verifyIdToken(token);

    req.uid = decoded.uid;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Sua sessão expirou. Entre novamente.",
    });
  }
}

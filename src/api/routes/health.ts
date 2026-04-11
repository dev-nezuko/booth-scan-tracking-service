import { Router } from "express";
import { sendSuccess } from "../utils/respond.js";

const router = Router();

router.get("/health", (_req, res) => {
  sendSuccess(res, { ok: true, ts: new Date().toISOString() });
});

export default router;

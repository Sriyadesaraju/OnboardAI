import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";

type ValidateTarget = "body" | "query" | "params";

export function validate(schema: ZodTypeAny, target: ValidateTarget = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[target]);
      (req as unknown as Record<ValidateTarget, unknown>)[target] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "ValidationError", details: err.flatten() });
      }
      next(err);
    }
  };
}

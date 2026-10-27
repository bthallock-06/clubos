import type { DbOrTx } from "@/db/client";
import type { Role } from "@/db/schema";

/**
 * Every domain function takes a Ctx. It carries the tenant (clubId) and the
 * actor, so a function cannot run without knowing whose data it touches.
 */
export type Ctx = {
  db: DbOrTx;
  clubId: string;
  /** Null for system actors such as a payment webhook. */
  userId: string | null;
  role: Role | "system";
  timezone: string;
};

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertRole(ctx: Ctx, ...allowed: Array<Ctx["role"]>): void {
  if (!allowed.includes(ctx.role)) throw new ForbiddenError();
}

/** Runs fn inside a transaction, handing it a Ctx bound to that transaction. */
export function inTransaction<T>(ctx: Ctx, fn: (tx: Ctx) => Promise<T>): Promise<T> {
  return ctx.db.transaction((tx) => fn({ ...ctx, db: tx }));
}

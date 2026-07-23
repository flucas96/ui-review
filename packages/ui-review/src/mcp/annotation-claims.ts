import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as z from "zod/v4";
import { withFileMutex } from "../server/file-mutex.js";

const claimSchema = z.object({
  agentId: z.string().min(1),
  annotationId: z.string().min(1),
  claimedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export type AnnotationClaim = z.infer<typeof claimSchema>;

type Clock = () => Date;

/** Error raised when another live agent session owns an annotation lease. */
export class AnnotationClaimConflictError extends Error {
  public constructor(claim: AnnotationClaim) {
    super(`Annotation ${claim.annotationId} is claimed by another agent session until ${claim.expiresAt}`);
    this.name = "AnnotationClaimConflictError";
  }
}

/** Error raised when an agent mutation has no active matching lease. */
export class AnnotationClaimRequiredError extends Error {
  public constructor(annotationId: string) {
    super(`Claim annotation ${annotationId} before changing its status, thread, or deletion state`);
    this.name = "AnnotationClaimRequiredError";
  }
}

/** File-backed annotation leases shared by every MCP process in one project. */
export class AnnotationClaimStore {
  readonly #claimsDirectory: string;
  readonly #clock: Clock;
  readonly #locksDirectory: string;

  public constructor(projectRoot: string, clock: Clock = () => new Date()) {
    const reviewDirectory = resolve(projectRoot, ".ui-review");
    this.#claimsDirectory = resolve(reviewDirectory, "claims");
    this.#locksDirectory = resolve(reviewDirectory, "claim-locks");
    this.#clock = clock;
  }

  /** Ensure claim and lock directories exist. */
  public async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.#claimsDirectory, { recursive: true }),
      mkdir(this.#locksDirectory, { recursive: true }),
    ]);
  }

  /** Return a live claim or omit an expired or missing lease. */
  public async get(annotationId: string): Promise<AnnotationClaim | undefined> {
    const claim = await this.#read(annotationId);
    return claim === undefined || this.#isExpired(claim) ? undefined : claim;
  }

  /** Atomically acquire or renew an annotation lease for one agent session. */
  public async claim(annotationId: string, agentId: string, leaseMilliseconds: number): Promise<AnnotationClaim> {
    if (!Number.isFinite(leaseMilliseconds) || leaseMilliseconds <= 0) {
      throw new RangeError("Annotation claim duration must be a positive finite number");
    }
    return this.#withLock(annotationId, async () => {
      const current = await this.#read(annotationId);
      const currentIsActive = current !== undefined && !this.#isExpired(current);
      if (currentIsActive && current.agentId !== agentId) {
        throw new AnnotationClaimConflictError(current);
      }

      const now = this.#clock();
      const claim: AnnotationClaim = {
        agentId,
        annotationId,
        claimedAt: currentIsActive && current.agentId === agentId
          ? current.claimedAt
          : now.toISOString(),
        expiresAt: new Date(now.getTime() + leaseMilliseconds).toISOString(),
      };
      await this.#write(annotationId, claim);
      return claim;
    });
  }

  /** Release an annotation lease when it belongs to the requesting agent session. */
  public async release(annotationId: string, agentId: string): Promise<boolean> {
    return this.#withLock(annotationId, async () => {
      const claim = await this.#read(annotationId);
      if (claim === undefined || this.#isExpired(claim)) {
        await rm(this.#claimPath(annotationId), { force: true });
        return false;
      }
      if (claim.agentId !== agentId) {
        throw new AnnotationClaimConflictError(claim);
      }
      await rm(this.#claimPath(annotationId), { force: true });
      return true;
    });
  }

  /** Run an agent mutation only while its live annotation lease remains valid. */
  public async runAsOwner<T>(annotationId: string, agentId: string, operation: () => Promise<T>): Promise<T> {
    return this.#withLock(annotationId, async () => {
      const claim = await this.#read(annotationId);
      if (claim === undefined || this.#isExpired(claim)) {
        throw new AnnotationClaimRequiredError(annotationId);
      }
      if (claim.agentId !== agentId) {
        throw new AnnotationClaimConflictError(claim);
      }
      return operation();
    });
  }

  #claimPath(annotationId: string): string {
    return resolve(this.#claimsDirectory, `${annotationKey(annotationId)}.json`);
  }

  #isExpired(claim: AnnotationClaim): boolean {
    return Date.parse(claim.expiresAt) <= this.#clock().getTime();
  }

  async #read(annotationId: string): Promise<AnnotationClaim | undefined> {
    try {
      return claimSchema.parse(JSON.parse(await readFile(this.#claimPath(annotationId), "utf8")));
    } catch (error: unknown) {
      if (isNodeError(error, "ENOENT")) {
        return undefined;
      }
      throw error;
    }
  }

  async #write(annotationId: string, claim: AnnotationClaim): Promise<void> {
    const target = this.#claimPath(annotationId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(claim)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async #withLock<T>(annotationId: string, operation: () => Promise<T>): Promise<T> {
    await this.initialize();
    const lockPath = resolve(this.#locksDirectory, `${annotationKey(annotationId)}.lock`);
    return withFileMutex(lockPath, operation);
  }
}

function annotationKey(annotationId: string): string {
  return createHash("sha256").update(annotationId).digest("hex");
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

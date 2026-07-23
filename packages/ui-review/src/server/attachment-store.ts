import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { ScreenshotAttachment } from "../shared/types.js";

const attachmentIdPattern = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

type SupportedImage = {
  readonly extension: "jpg" | "png" | "webp";
  readonly mimeType: ScreenshotAttachment["mimeType"];
};

type SaveScreenshotInput = {
  readonly body: Buffer;
  readonly fileName: string;
  readonly height: number;
  readonly mimeType: string;
  readonly width: number;
};

/** Error raised when a requested local screenshot does not exist. */
export class AttachmentNotFoundError extends Error {
  public constructor(attachmentId: string) {
    super(`Screenshot ${attachmentId} was not found`);
    this.name = "AttachmentNotFoundError";
  }
}

/** Persist and retrieve size-limited screenshot attachments outside the event log. */
export class ScreenshotAttachmentStore {
  readonly #directory: string;

  public constructor(projectRoot: string) {
    this.#directory = resolve(projectRoot, ".ui-review", "attachments");
  }

  /** Ensure the private screenshot directory exists. */
  public async initialize(): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
  }

  /** Validate and persist one uploaded screenshot. */
  public async save(input: SaveScreenshotInput): Promise<ScreenshotAttachment> {
    const image = supportedImage(input.mimeType, input.body);
    const id = `${randomUUID()}.${image.extension}`;
    await writeFile(resolve(this.#directory, id), input.body, { flag: "wx" });
    return {
      byteSize: input.body.byteLength,
      createdAt: new Date().toISOString(),
      fileName: safeFileName(input.fileName, image.extension),
      height: input.height,
      id,
      mimeType: image.mimeType,
      width: input.width,
    };
  }

  /** Verify that an attachment reference points to an existing local screenshot. */
  public async assertExists(attachmentId: string): Promise<void> {
    await access(this.#path(attachmentId)).catch(() => {
      throw new AttachmentNotFoundError(attachmentId);
    });
  }

  /** Read one attachment with a MIME type derived from its validated identifier. */
  public async read(attachmentId: string): Promise<{
    readonly body: Buffer;
    readonly mimeType: ScreenshotAttachment["mimeType"];
  }> {
    const path = this.#path(attachmentId);
    const body = await readFile(path).catch(() => {
      throw new AttachmentNotFoundError(attachmentId);
    });
    return {
      body,
      mimeType: mimeTypeFromId(attachmentId),
    };
  }

  #path(attachmentId: string): string {
    if (!attachmentIdPattern.test(attachmentId)) {
      throw new AttachmentNotFoundError(attachmentId);
    }
    return resolve(this.#directory, attachmentId);
  }
}

function supportedImage(mimeType: string, body: Buffer): SupportedImage {
  if (mimeType === "image/png" && isPng(body)) {
    return { extension: "png", mimeType };
  }
  if (mimeType === "image/jpeg" && isJpeg(body)) {
    return { extension: "jpg", mimeType };
  }
  if (mimeType === "image/webp" && isWebp(body)) {
    return { extension: "webp", mimeType };
  }
  throw new TypeError("Screenshot must be a valid PNG, JPEG, or WebP image");
}

function isPng(body: Buffer): boolean {
  return body.length >= 8
    && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function isJpeg(body: Buffer): boolean {
  return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
}

function isWebp(body: Buffer): boolean {
  return body.length >= 12
    && body.toString("ascii", 0, 4) === "RIFF"
    && body.toString("ascii", 8, 12) === "WEBP";
}

function safeFileName(fileName: string, extension: SupportedImage["extension"]): string {
  const normalized = basename(fileName).replaceAll(/[\u0000-\u001f\u007f]/g, "").trim();
  return (normalized.length === 0 ? `screenshot.${extension}` : normalized).slice(0, 255);
}

function mimeTypeFromId(attachmentId: string): ScreenshotAttachment["mimeType"] {
  if (attachmentId.endsWith(".png")) {
    return "image/png";
  }
  if (attachmentId.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/jpeg";
}

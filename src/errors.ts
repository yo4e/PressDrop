export type PressDropErrorCode =
  | "INPUT_READ_ERROR"
  | "PARSE_ERROR"
  | "VALIDATION_ERROR"
  | "MISSING_MEDIA"
  | "UNSUPPORTED_BLOCK"
  | "GUTENBERG_VALIDATION_ERROR";

export class PressDropError extends Error {
  readonly code: PressDropErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PressDropErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PressDropError";
    this.code = code;
    this.details = details;
  }
}

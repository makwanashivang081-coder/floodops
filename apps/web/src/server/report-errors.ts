export class ReportRejectedError extends Error {
  readonly code = "PHOTO_REJECTED" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReportRejectedError";
  }
}

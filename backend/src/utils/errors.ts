export class AppHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppHttpError';
  }
}

/**
 * Send consistent JSON error response for AppHttpError or unexpected Error.
 */
export function sendErrorResponse(
  res: { status: (code: number) => { json: (body: unknown) => void } },
  error: unknown,
  fallbackStatus = 500
): void {
  if (error instanceof AppHttpError) {
    res.status(error.statusCode).json({
      success: false,
      ...(error.code ? { code: error.code } : {}),
      message: error.message,
    });
    return;
  }

  const message =
    error instanceof Error && error.message
      ? error.message
      : 'Terjadi kesalahan internal server';
  res.status(fallbackStatus).json({ success: false, message });
}

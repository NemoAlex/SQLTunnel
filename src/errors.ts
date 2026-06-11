export class GatewayError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function toErrorPayload(error: unknown, requestId: string) {
  if (error instanceof GatewayError) {
    return {
      statusCode: error.statusCode,
      body: {
        code: error.code,
        message: error.message,
        requestId
      }
    };
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return {
    statusCode: 500,
    body: {
      code: "INTERNAL_ERROR",
      message,
      requestId
    }
  };
}

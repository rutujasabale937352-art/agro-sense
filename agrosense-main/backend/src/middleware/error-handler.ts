import { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    response.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
};

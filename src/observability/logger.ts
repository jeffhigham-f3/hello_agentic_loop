import pino from "pino";

export function createLogger(level: string = process.env.LOG_LEVEL ?? "info") {
  return pino({
    name: "agentic-loop",
    level,
  });
}

export const logger = createLogger();

export type AppLogger = typeof logger;

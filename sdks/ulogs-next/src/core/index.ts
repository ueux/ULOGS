import { LoggerConfig, LogPayload, LogType } from "../types/index.js";
import { ULOGSTransport } from "../utils/index.js";

export function createLogger(config: LoggerConfig) {
  const transport = new ULOGSTransport(config);

  const send = async (payload: LogPayload) => {
    const {
      type = "info",
      message,
      importance,
      subsystem,
      operation,
      track,
      security,
      service,
      metrics,
      timestamps,
      appName,
      environment,
    } = payload;
    const finalPayload: LogPayload = {
      type,
      message,
      importance,
      subsystem,
      operation,
      service,
      track,
      security,
      metrics,
      timestamps,
      appName: appName || config.appName || "default",
      environment:
        environment ||
        config.environment ||
        process.env.NODE_ENV ||
        "development",
    };
    await transport.send(finalPayload);
  };
  const createTypeMethod =
    (type: LogType) => (payload: Omit<LogPayload, "type">) =>
      send({ ...payload, type });
  return {
    send,
    info: createTypeMethod("info"),
    error: createTypeMethod("error"),
    metric: createTypeMethod("metric"),
    audit: createTypeMethod("audit"),
    warning: createTypeMethod("warning"),
    // get: (filters ?: Record<string, any>) = transport.get(filters),
    // stream: (filters?: Record<string, any>) => transport.stream(filters);
  };
}

import { ULOGSTransport } from "../utils/index.js";
export function createLogger(config) {
    const transport = new ULOGSTransport(config);
    const send = async (payload) => {
        const { type = "info", message, importance, subsystem, operation, track, security, service, metrics, timestamps, appName, environment, } = payload;
        const finalPayload = {
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
            environment: environment ||
                config.environment ||
                process.env.NODE_ENV ||
                "development",
        };
        await transport.send(finalPayload);
    };
    const createTypeMethod = (type) => (payload) => send({ ...payload, type });
    return {
        send,
        info: createTypeMethod("info"),
        error: createTypeMethod("error"),
        metric: createTypeMethod("metric"),
        audit: createTypeMethod("audit"),
        warning: createTypeMethod("warning"),
        get: (filters) => transport.get(filters),
        stream: (filters) => transport.stream(filters),
    };
}

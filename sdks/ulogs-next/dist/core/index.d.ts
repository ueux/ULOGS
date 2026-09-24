import { LoggerConfig, LogPayload } from "../types/index.js";
import { LogRequestOptions, VerifyWebhookOptions } from "../utils/index.js";
export declare function createLogger(config: LoggerConfig): {
    send: (payload: LogPayload) => Promise<void>;
    info: (payload: Omit<LogPayload, "type">) => Promise<void>;
    error: (payload: Omit<LogPayload, "type">) => Promise<void>;
    metric: (payload: Omit<LogPayload, "type">) => Promise<void>;
    audit: (payload: Omit<LogPayload, "type">) => Promise<void>;
    warning: (payload: Omit<LogPayload, "type">) => Promise<void>;
    get: (filters?: Record<string, any>, options?: LogRequestOptions) => Promise<any>;
    verifyWebhook: (options: VerifyWebhookOptions) => Promise<any>;
    stream: (filters?: Record<string, any>, options?: LogRequestOptions) => {
        body: ReadableStream<Uint8Array>;
    };
};

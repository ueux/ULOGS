import { LoggerConfig, LogPayload } from "../types/index.js";
export interface LogRequestOptions {
    authToken?: string;
}
export interface VerifyWebhookOptions {
    signature: string;
    timestamp: string;
    body: unknown;
}
export declare class ULOGSTransport {
    private config;
    private baseUrl;
    private apiKey;
    private appName;
    private environment;
    private headers;
    private buffer;
    private timer;
    private flushInterval;
    private shuttingDown;
    private isFlushing;
    constructor(config: LoggerConfig);
    send(payload: LogPayload): Promise<void>;
    private setupGracefulShutdown;
    private flush;
    private buildReadHeaders;
    get(filters?: Record<string, any>, options?: LogRequestOptions): Promise<any>;
    verifyWebhook({ signature, timestamp, body }: VerifyWebhookOptions): Promise<any>;
    stream(filters?: Record<string, any>, options?: LogRequestOptions): {
        body: ReadableStream<Uint8Array>;
    };
}

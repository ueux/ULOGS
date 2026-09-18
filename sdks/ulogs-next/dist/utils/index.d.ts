import { LoggerConfig, LogPayload } from "../types/index.js";
export declare class ULOGSTransport {
    private baseUrl;
    private headers;
    private buffer;
    private timer;
    private flushInterval;
    private shuttingDown;
    private isFlushing;
    constructor(config: LoggerConfig);
    send(payload: LogPayload): Promise<void>;
    private scheduleFlush;
    private setupGracefulShutdown;
    private flush;
}

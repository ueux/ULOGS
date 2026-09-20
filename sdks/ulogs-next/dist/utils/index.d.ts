import { LoggerConfig, LogPayload } from "../types/index.js";
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
}

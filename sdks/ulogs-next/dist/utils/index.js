import { getEnvConfig } from "../config/index.js";
export class ULOGSTransport {
    config;
    baseUrl;
    apiKey;
    appName;
    environment;
    headers;
    buffer = [];
    timer = null;
    flushInterval = 2000;
    shuttingDown = false;
    isFlushing = false;
    constructor(config) {
        this.config = config;
        const envConfig = getEnvConfig();
        this.baseUrl = envConfig.baseUrl;
        this.apiKey = config.apiKey;
        this.appName = config.appName;
        this.environment = config.environment;
        this.headers = {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            ...(config.appName ? { "x-ulogs-app-name": config.appName } : {}),
            ...(config.environment ? { "x-ulogs-env": config.environment } : {}),
        };
        this.setupGracefulShutdown();
    }
    async send(payload) {
        if (this.shuttingDown)
            return;
        this.buffer.push({
            ...payload,
            ingested_at: Date.now(),
        });
        if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), this.flushInterval);
        }
    }
    setupGracefulShutdown() {
        const shutdownHandler = async (signal) => {
            if (this.shuttingDown)
                return;
            this.shuttingDown = true;
            try {
                await this.flush();
            }
            catch (err) {
                console.error("[ULOGSTransport] Flush during shutdown failed:", err);
            }
            finally {
                process.exit(0);
            }
        };
        process.on("beforeExit", () => shutdownHandler("beforeExit"));
        process.on("SIGINT", () => shutdownHandler("SIGINT"));
        process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
    }
    async flush() {
        if (this.isFlushing)
            return;
        this.isFlushing = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const batch = this.buffer.splice(0, this.buffer.length);
        if (batch.length === 0) {
            this.isFlushing = false;
            return;
        }
        try {
            await fetch(`${this.baseUrl}/logs/send`, {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({ logs: batch }),
                keepalive: true,
            });
        }
        catch (error) {
            console.error("ULOGSTransport flush failed:", error);
        }
        this.isFlushing = false;
    }
}

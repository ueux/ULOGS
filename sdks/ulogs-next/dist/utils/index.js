import { getEnvConfig } from "../config/index.js";
export class ULOGSTransport {
    baseUrl;
    headers;
    buffer = [];
    timer = null;
    flushInterval = 2000;
    shuttingDown = false;
    isFlushing = false;
    constructor(config) {
        const envConfig = getEnvConfig();
        this.baseUrl = (config.baseUrl || envConfig.baseUrl).replace(/\/$/, "");
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
        this.scheduleFlush();
    }
    scheduleFlush() {
        if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), this.flushInterval);
        }
    }
    setupGracefulShutdown() {
        const shutdownHandler = async () => {
            if (this.shuttingDown)
                return;
            this.shuttingDown = true;
            try {
                await this.flush();
            }
            catch (err) {
                console.error("[ULOGSTransport] Flush during shutdown failed:", err);
            }
        };
        process.on("beforeExit", shutdownHandler);
        process.on("SIGINT", shutdownHandler);
        process.on("SIGTERM", shutdownHandler);
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
            const response = await fetch(`${this.baseUrl}/logs/send`, {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({ logs: batch }),
                keepalive: true,
            });
            if (!response.ok) {
                this.buffer.unshift(...batch);
                console.error(`[ULOGSTransport] Flush failed with HTTP ${response.status}`);
                this.scheduleFlush();
            }
        }
        catch (error) {
            console.error("ULOGSTransport flush failed:", error);
            this.buffer.unshift(...batch);
            this.scheduleFlush();
        }
        this.isFlushing = false;
    }
}

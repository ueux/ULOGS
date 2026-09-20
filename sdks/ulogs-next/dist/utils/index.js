import { getEnvConfig } from "../config/index.js";
let shutdownHookRegistered = false;
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
        if (shutdownHookRegistered)
            return;
        shutdownHookRegistered = true;
        process.setMaxListeners(Math.max(process.getMaxListeners(), 20));
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
    async get(filters) {
        const headers = {
            "x-api-key": this.apiKey,
            ...(this.appName ? { "x-ulogs-app-name": this.appName } : {}),
            ...(this.environment ? { "x-ulogs-env": this.environment } : {}),
        };
        const qs = filters && Object.keys(filters).length > 0
            ? `?${new URLSearchParams(filters).toString()}`
            : "";
        const res = await fetch(`${this.baseUrl}/logs${qs}`, { headers });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(` ULOGS get failed (${res.status}): ${text.slice(0, 200)}`);
        }
        return res.json();
    }
    stream(filters) {
        const qs = new URLSearchParams(filters).toString();
        const url = `${this.baseUrl}/logs/stream?${qs}`;
        const headers = {
            "x-api-key": this.apiKey,
            ...(this.appName ? { "x-ulogs-app-name": this.appName } : {}),
            ...(this.environment ? { "x-ulogs-env": this.environment } : {}),
        };
        const abortController = new AbortController();
        const readable = new ReadableStream({
            start: async (controller) => {
                const res = await fetch(url, {
                    headers,
                    signal: abortController.signal,
                });
                if (!res.body) {
                    controller.error(new Error("Upstream stream unavailable"));
                    return;
                }
                const reader = res.body.getReader();
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done)
                            break;
                        if (value)
                            controller.enqueue(value);
                    }
                    controller.close();
                }
                catch (error) {
                    controller.error(error);
                }
            },
            cancel() {
                abortController.abort();
            },
        });
        return { body: readable };
    }
}

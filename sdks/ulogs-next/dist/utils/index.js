import { getEnvConfig } from "../config/index.js";
let shutdownHookRegistered = false;
const activeTransports = new Set();
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
        activeTransports.add(this);
        if (shutdownHookRegistered)
            return;
        shutdownHookRegistered = true;
        process.setMaxListeners(Math.max(process.getMaxListeners(), 20));
        const flushAll = async () => {
            await Promise.all([...activeTransports].map((transport) => transport.flush().catch((err) => {
                console.error("[ULOGSTransport] Flush during shutdown failed:", err);
            })));
        };
        process.on("beforeExit", () => void flushAll());
        let exiting = false;
        const onSignal = () => {
            if (exiting)
                return;
            exiting = true;
            for (const transport of activeTransports) {
                transport.shuttingDown = true;
            }
            void flushAll().finally(() => process.exit(0));
        };
        process.on("SIGINT", onSignal);
        process.on("SIGTERM", onSignal);
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
            const body = JSON.stringify({ logs: batch });
            // keepalive requests are capped (~64KB) by browsers; only use it when the
            // batch is small enough to survive an unload.
            const useKeepalive = body.length <= 60_000;
            await fetch(`${this.baseUrl}/logs/send`, {
                method: "POST",
                headers: this.headers,
                body,
                keepalive: useKeepalive,
            });
        }
        catch (error) {
            console.error("ULOGSTransport flush failed:", error);
        }
        this.isFlushing = false;
    }
    buildReadHeaders(options) {
        const headers = {
            ...(options?.authToken
                ? { Authorization: `Bearer ${options.authToken}` }
                : { "x-api-key": this.apiKey }),
            ...(this.appName ? { "x-ulogs-app-name": this.appName } : {}),
            ...(this.environment ? { "x-ulogs-env": this.environment } : {}),
        };
        return headers;
    }
    async get(filters, options) {
        const headers = this.buildReadHeaders(options);
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
    async verifyWebhook({ signature, timestamp, body }) {
        const response = await fetch(`${this.baseUrl}/alerts/verify-webhook`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
            },
            body: JSON.stringify({
                signature,
                timestamp,
                body,
            }),
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message ?? "Failed to verify webhook.");
        }
        return result;
    }
    stream(filters, options) {
        const qs = filters ? new URLSearchParams(filters).toString() : "";
        const url = `${this.baseUrl}/logs/stream${qs ? `?${qs}` : ""}`;
        const headers = this.buildReadHeaders(options);
        const abortController = new AbortController();
        const readable = new ReadableStream({
            start: async (controller) => {
                const res = await fetch(url, {
                    headers,
                    signal: abortController.signal,
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    controller.error(new Error(`ULOGS stream failed (${res.status}): ${text.slice(0, 200)}`));
                    return;
                }
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

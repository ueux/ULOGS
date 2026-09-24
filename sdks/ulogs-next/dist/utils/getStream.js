"use client";
import { useEffect, useRef, useState } from "react";
let fallbackIdCounter = 0;
function uniqueLogId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // crypto.randomUUID only exists in secure contexts
    return `ulogs-${Date.now()}-${(fallbackIdCounter++).toString(36)}-${Math.random()
        .toString(36)
        .slice(2)}`;
}
function toLogEntry(l) {
    const rawType = (l.type || "info").toLowerCase();
    const level = rawType === "warning"
        ? "warning"
        : rawType === "success"
            ? "success"
            : rawType === "error"
                ? "error"
                : rawType === "debug"
                    ? "debug"
                    : rawType === "audit"
                        ? "audit"
                        : rawType === "metric"
                            ? "metric"
                            : "info";
    let tsIso;
    if (typeof l.timestamp === "number") {
        tsIso = new Date(l.timestamp * 1000).toISOString();
    }
    else {
        tsIso = new Date(String(l.timestamp).replace(" ", "T") + "Z").toISOString();
    }
    return {
        id: uniqueLogId(),
        ts: tsIso,
        level,
        source: l.appName || "default",
        message: l.message,
        payload: { ...l },
    };
}
export function getStream(filters) {
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [connected, setConnected] = useState(false);
    const esRef = useRef(null);
    useEffect(() => {
        let cancelled = false;
        let reconnectTimer = null;
        let pollTimer = null;
        const buildQuery = () => {
            if (!filters || Object.keys(filters).length === 0)
                return "";
            return `?${new URLSearchParams(Object.entries(filters).reduce((acc, [k, v]) => {
                if (v !== undefined)
                    acc[k] = String(v);
                return acc;
            }, {})).toString()}`;
        };
        const applyIncoming = (payload) => {
            setData((prev) => {
                let incoming = [];
                if (payload && Array.isArray(payload.logs)) {
                    incoming = payload.logs.map((l) => toLogEntry(l));
                }
                else if (Array.isArray(payload)) {
                    incoming = payload.map((l) => toLogEntry(l));
                }
                else if (payload && payload.keyId) {
                    incoming = [toLogEntry(payload)];
                }
                if (payload?.type === "initial") {
                    const next = incoming;
                    setIsLoading(false);
                    return next.length > 5000 ? next.slice(next.length - 5000) : next;
                }
                const next = [...prev, ...incoming];
                if (next.length > 5000) {
                    next.splice(0, next.length - 5000);
                }
                setIsLoading(false);
                return next;
            });
        };
        const fetchOnce = async () => {
            if (cancelled)
                return;
            try {
                const qs = buildQuery();
                const res = await fetch(`/api/ulogs/logs${qs}`, { cache: "no-store" });
                if (!res.ok) {
                    throw new Error(`Failed to fetch logs (${res.status})`);
                }
                const payload = await res.json();
                const rows = Array.isArray(payload) ? payload : (payload.logs ?? []);
                setData(rows.map((item) => toLogEntry(item)));
                setIsLoading(false);
                setError(null);
            }
            catch (pollError) {
                console.log("ULOGS stream: polling fallback failed", pollError);
                setError(pollError instanceof Error
                    ? pollError
                    : new Error("Polling fallback failed"));
            }
        };
        const startPolling = () => {
            if (pollTimer)
                clearInterval(pollTimer);
            pollTimer = setInterval(() => {
                if (!cancelled)
                    void fetchOnce();
            }, 5000);
            void fetchOnce();
        };
        const connect = () => {
            if (cancelled)
                return;
            const qs = buildQuery();
            const es = new EventSource(`/api/ulogs/stream${qs}`);
            esRef.current = es;
            setConnected(true);
            setIsLoading(true);
            setError(null);
            es.onopen = () => {
                if (pollTimer) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                }
                setConnected(true);
                setError(null);
            };
            es.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    applyIncoming(payload);
                }
                catch (caughtError) {
                    console.log("ULOGS stream: failed to pass SSE message", caughtError);
                    setError(caughtError);
                    setIsLoading(false);
                }
            };
            es.onerror = (err) => {
                console.log("ULOGS stream: SSE error", err);
                setConnected(false);
                setError(err instanceof Error ? err : new Error("SSE error"));
                if (es.readyState === EventSource.CLOSED) {
                    if (reconnectTimer)
                        clearTimeout(reconnectTimer);
                    reconnectTimer = setTimeout(() => {
                        if (!cancelled)
                            connect();
                    }, 2000);
                }
                if (pollTimer)
                    clearInterval(pollTimer);
                startPolling();
            };
        };
        connect();
        return () => {
            cancelled = true;
            if (reconnectTimer)
                clearTimeout(reconnectTimer);
            if (pollTimer)
                clearInterval(pollTimer);
            esRef.current?.close();
            esRef.current = null;
            setConnected(false);
        };
    }, [JSON.stringify(filters || {})]);
    const disconnect = () => {
        esRef.current?.close();
        esRef.current = null;
        setConnected(false);
    };
    return { data, isLoading, error, connected, disconnect };
}

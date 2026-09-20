"use client";
import { useEffect, useRef, useState } from "react";
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
        id: crypto.randomUUID(),
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
        const qs = filters && Object.keys(filters).length > 0
            ? `?${new URLSearchParams(Object.entries(filters).reduce((acc, [k, v]) => {
                if (v !== undefined)
                    acc[k] = String(v);
                return acc;
            }, {})).toString()}`
            : "";
        const es = new EventSource(`/api/ulogs/stream${qs}`);
        esRef.current = es;
        setConnected(true);
        setIsLoading(true);
        setError(null);
        es.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
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
                    if (payload?.type == "initial") {
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
            }
            catch (error) {
                console.log("ULOGS stream: failed to pass SSE message", error);
                setError(error);
                setIsLoading(false);
            }
        };
        es.onerror = (err) => {
            console.log("ULOGS stream: SSE error", err);
            setError(err instanceof Error ? err : new Error("SSE error"));
        };
        return () => {
            es.close();
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

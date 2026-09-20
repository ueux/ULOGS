"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
const inflight = new Map();
const cache = new Map();
function buildKey(params) {
    const sp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).length > 0) {
            sp.append(k, String(v));
        }
    });
    return sp.toString();
}
export function getLogs(filters) {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const key = useMemo(() => buildKey(filters), [filters]);
    const fetchOnce = useCallback(async (k) => {
        if (cache.has(k)) {
            return cache.get(k);
        }
        let p = inflight.get(k);
        if (!p) {
            const url = `api/ulogs/logs${k ? `?${k}` : ""}`;
            p = fetch(url, { cache: "no-store" }).then(async (res) => {
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Failed to fetch logs (${res.status}) ${text}`);
                }
                return res.json();
            });
            inflight.set(k, p);
        }
        try {
            const result = await p;
            cache.set(k, result);
            return result;
        }
        finally {
            inflight.delete(k);
        }
    }, []);
    const fetchLogs = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const json = await fetchOnce(key);
            const rows = Array.isArray(json)
                ? json
                : (json.logs ?? json ?? []);
            setData(rows ?? []);
        }
        catch (error) {
            if (error?.name !== "AbortError") {
                setError(error);
                setData(null);
            }
        }
        finally {
            setIsLoading(false);
        }
    }, [key, fetchOnce]);
    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);
    const refetch = useCallback(async () => {
        cache.delete(key);
        await fetchLogs();
    }, []);
    return { data, isLoading, error, refetch };
}

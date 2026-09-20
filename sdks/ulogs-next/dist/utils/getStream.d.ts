type Filters = Record<string, string | number | boolean | undefined>;
type LogLevel = "info" | "warning" | "error" | "debug" | "success" | "audit" | "metric";
export type StreamLogNormalized = {
    id: string;
    ts: string;
    level: LogLevel;
    source: string;
    message: string;
    payload: Record<string, unknown>;
};
export type GetStreamResult = {
    data: StreamLogNormalized[];
    isLoading: boolean;
    error: Error | null;
    connected: boolean;
    disconnect: () => void;
};
export declare function getStream(filters?: Filters): GetStreamResult;
export {};

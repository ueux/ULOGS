type Filters = Record<string, string | number | boolean | undefined>;
export type GetLogsResult<T = any> = {
    data: T[] | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
};
export declare function getLogs<T = any>(filters?: Filters): GetLogsResult<T>;
export {};

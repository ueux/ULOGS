import { LogTimestamps } from "./log.js";
import { LogMetrcis } from "./metrics.js";
import { LogSecurity } from "./security.js";
import { LogTrack } from "./track.js";
export interface LoggerConfig {
    apiKey: string;
    appName?: string;
    environment?: string;
    baseUrl?: string;
}
export interface LogPayload {
    type: LogType;
    message: string;
    importance?: Importance;
    subsystem?: Subsystem;
    operation?: string;
    track?: LogTrack;
    security?: LogSecurity;
    metrics?: LogMetrcis;
    service?: string;
    timestamps?: LogTimestamps;
    ingested_at?: number;
    appName?: string;
    environment?: string;
}
export type LogType = "error" | "warning" | "info" | "audit" | "metric" | "debug" | "success";
export type LogLevel = LogType;
export type Importance = "critical" | "high" | "medium" | "low";
export type Subsystem = "db" | "cache" | "queue" | "network";
export type UserRole = "super-admin" | "admin" | "user";
export type AuthStatus = "success" | "failed" | "expired";

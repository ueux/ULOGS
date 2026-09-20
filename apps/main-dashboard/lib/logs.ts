import { createLogger } from "@ulogs/next";

export const logger = createLogger({
    apiKey: process.env.ULOGS_API_KEY!,
    appName: "my-nextjs-app", // Optional
    environment: process.env.NODE_ENV || "development"

})
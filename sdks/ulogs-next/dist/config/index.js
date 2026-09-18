export const getEnvConfig = () => {
    return {
        baseUrl: process.env.ULOGS_BASE_URL || "http://localhost:8080/api/v1",
    };
};

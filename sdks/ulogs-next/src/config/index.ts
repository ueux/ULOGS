export interface EnvConfig {
  baseUrl: string;
}
export const getEnvConfig = (): EnvConfig => {
  return {
    baseUrl: process.env.ULOGS_BASE_URL || "http://localhost:8080/api/v1",
  };
};

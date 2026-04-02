export type AppConfig = {
  port: number;
  appBaseUrl: string;
  salesforceAuthServiceUrl: string;
  salesforceAuthServiceSecret: string;
};

function requiredEnv(name: string, fallback = ""): string {
  const value = process.env[name] ?? fallback;
  return String(value).trim();
}

export function getConfig(): AppConfig {
  return {
    port: Number(process.env.PORT || 8080),
    appBaseUrl: requiredEnv("APP_BASE_URL", "http://localhost:8080"),
    salesforceAuthServiceUrl: requiredEnv("SALESFORCE_AUTH_SERVICE_URL"),
    salesforceAuthServiceSecret: requiredEnv("SALESFORCE_AUTH_SERVICE_SECRET")
  };
}


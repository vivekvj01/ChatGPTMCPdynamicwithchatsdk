import "dotenv/config";

export type AppConfig = {
  port: number;
  appBaseUrl: string;
  salesforceAuthServiceUrl: string;
  salesforceAuthServiceSecret: string;
  salesforceAgentId: string;
  salesforceTenantId: string;
  salesforceRegion: string;
  salesforceLoginUrl: string;
  salesforceAgentApiBaseUrl: string;
  openaiApiKey: string;
  openaiWidgetModel: string;
  herokuInferenceKey: string;
  herokuInferenceUrl: string;
  herokuInferenceModel: string;
  widgetProviderOrder: string;
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
    salesforceAuthServiceSecret: requiredEnv("SALESFORCE_AUTH_SERVICE_SECRET"),
    salesforceAgentId: requiredEnv("SALESFORCE_AGENT_ID"),
    salesforceTenantId: requiredEnv("SALESFORCE_TENANT_ID"),
    salesforceRegion: requiredEnv("SALESFORCE_REGION"),
    salesforceLoginUrl: requiredEnv("SALESFORCE_LOGIN_URL"),
    salesforceAgentApiBaseUrl: requiredEnv("SALESFORCE_AGENT_API_BASE_URL"),
    openaiApiKey: requiredEnv("OPENAI_API_KEY"),
    openaiWidgetModel: requiredEnv("OPENAI_WIDGET_MODEL", "gpt-5.4-mini"),
    herokuInferenceKey: requiredEnv("INFERENCE_KEY"),
    herokuInferenceUrl: requiredEnv("INFERENCE_URL", "https://us.inference.heroku.com/v1/chat/completions"),
    herokuInferenceModel: requiredEnv("INFERENCE_MODEL_ID", "claude-4-5-sonnet"),
    widgetProviderOrder: requiredEnv("WIDGET_PROVIDER_ORDER", "heroku,openai,demo")
  };
}

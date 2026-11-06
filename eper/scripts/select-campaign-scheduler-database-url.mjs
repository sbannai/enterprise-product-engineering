export function selectCampaignSchedulerDatabaseUrl(env = process.env) {
  return [
    env.EPER_CAMPAIGN_SCHEDULER_DATABASE_URL,
    env.EPER_AUDIT_DATABASE_URL,
    env.EPER_PAYMENT_DATABASE_URL,
    env.DATABASE_URL,
  ].find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

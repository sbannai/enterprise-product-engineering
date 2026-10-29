import { appendAuditEvent, type AuditSqlPool, type AuditEnvironment } from "../audit/audit-event-store.js";
import { PostgresCampaignSchedulerStore } from "./postgres-campaign-scheduler-store.js";

export interface CampaignDomainEvent {
  tenantId: string;
  applicationId: string;
  eventType: string;
  eventId: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
  environment?: AuditEnvironment;
}

/**
 * Routes domain events to the durable campaign queue. It never invokes campaign
 * actions inline: approved schedules are enqueued, then workers dispatch later.
 * Audit is written before this adapter acknowledges success to its caller.
 */
export class CampaignDomainEventRouter {
  constructor(
    private readonly scheduler: PostgresCampaignSchedulerStore,
    private readonly auditPool: AuditSqlPool,
  ) {}

  async publish(event: CampaignDomainEvent): Promise<{ acceptedExecutions: number }> {
    const acceptedExecutions = await this.scheduler.enqueueEventExecutions({
      tenantId: event.tenantId,
      applicationId: event.applicationId,
      eventType: event.eventType,
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      payload: event.payload,
    });

    await appendAuditEvent(this.auditPool, {
      tenantId: event.tenantId,
      applicationId: event.applicationId,
      environment: event.environment ?? "sandbox",
      actorType: "system",
      actorId: "campaign-domain-event-router",
      action: "campaign.event.routed",
      outcome: "success",
      resourceType: "campaign_event",
      resourceId: event.eventId,
      operationId: event.eventId,
      correlationId: event.correlationId ?? event.eventId,
      idempotencyKey: "campaign-event-route:" + event.eventId,
      source: "integration",
      operationName: "campaign-domain-event-router.publish",
      payload: {
        eventType: event.eventType,
        acceptedExecutions,
      },
    });

    return { acceptedExecutions };
  }
}

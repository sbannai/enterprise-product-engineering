# EPER AWS UAT Infrastructure Security Review

**Review date:** 2026-10-06  
**Branch:** `feat/eper-minimal-uat-runtime`  
**Scope:** Terraform under `eper/infra/aws/terraform`  
**Decision:** NOT READY FOR APPLY; no AWS resources have been created.

## Confirmed controls

- HTTPS listener requires an ACM certificate ARN.
- ALB ingress requires explicit IPv4 CIDRs and rejects `0.0.0.0/0`.
- ECS task inbound traffic on port 8080 is restricted to the ALB security group.
- ECR uses immutable image tags and scan-on-push.
- CloudWatch log retention is set to 30 days.
- Terraform now requires `image_tag == build_id`, and the task definition no longer overrides the image's baked-in `EPER_BUILD_ID`.
- ECS uses a task execution role rather than static AWS credentials.

## Deployment blockers / required checks

1. **Subnet suitability is assumed, not proven.** Terraform selects every subnet in the default VPC. Before apply, verify the VPC exists in `ap-south-2`, the ALB has subnets in at least two Availability Zones, and ECS subnets have a valid egress path for ECR image pulls and CloudWatch Logs. Do not assume all default-VPC subnets are public.
2. **Public IP assignment is enabled for Fargate tasks.** Task security-group ingress is restricted to the ALB, but public IP assignment increases exposure surface. Prefer private subnets with appropriate VPC endpoints/NAT where available; document the cost/security trade-off before choosing a topology.
3. **No ECR lifecycle policy is defined.** Add an approved retention policy before publishing repeated images, so old images do not accumulate indefinitely.
4. **No account-level budget/alert is provisioned by this configuration.** Establish a cost limit and alerts in the AWS account before creating an ALB, Fargate service, public IPv4 addresses, ECR storage, or logs. A budget alert is not a hard spending cap.
5. **Certificate and ingress values remain unresolved.** Verify the ACM certificate is in `ap-south-2`, is issued, covers the approved hostname, and that ingress CIDRs are the testers' current public IP ranges. Do not widen ingress to `0.0.0.0/0`.
6. **Terraform has not been validated against the target AWS account.** Run `terraform fmt -check`, `terraform validate`, and a reviewed `terraform plan` using non-secret variables after prerequisites are known. A plan is not authorization to apply.

## Release identity control

The image tag and embedded build ID must be the same 40-character commit SHA. The release workflow currently builds and smoke-tests the image locally but does not push it to ECR. A separate approved publishing step must build from the explicitly approved commit, push to ECR, and record the resulting image digest before Terraform deployment.

## Current release / UAT status

- PR #74: open and unmerged.
- AWS resources: none created by this work.
- Requirements: 228; chapters: 38; scope unchanged.
- Runtime CI and pilot-matrix success are not business UAT acceptance.
- Business UAT: **NOT EXECUTED**.

## Exit criteria for this review

Do not apply Terraform until subnet routing/AZ coverage, certificate/hostname, tester CIDRs, budget alerts, ECR retention, and image-publishing provenance are resolved and reviewed.

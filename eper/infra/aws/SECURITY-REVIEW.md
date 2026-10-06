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

1. **Subnet suitability is supplied as input but not verified against the target account yet.** Terraform requires an explicit VPC ID, at least two ALB subnet IDs, and one or more task subnet IDs; it does not automatically select the default VPC or all its subnets. CI validates configuration and checks declared routing invariants, but only an account-backed plan can confirm that the supplied VPC/subnets exist in `ap-south-2`, have the intended AZ coverage, and provide the required endpoint connectivity.
2. **Private task subnet routing must be verified.** Fargate tasks set `assign_public_ip = false`. Terraform now rejects task subnets whose associated route table has a default route directly through an internet gateway. This does not prove every subnet is otherwise private; review NAT routes, NACLs, endpoint DNS, and route tables in the target account before apply.
3. **ECR lifecycle retention is configured.** The repository has an immutable-tag lifecycle policy retaining the newest 10 tagged images. Confirm this retention is sufficient for audit/rollback needs before publishing.
4. **No account-level budget/alert is provisioned by this configuration.** Establish a cost limit and alerts in the AWS account before creating an ALB, Fargate service, public IPv4 addresses, ECR storage, or logs. A budget alert is not a hard spending cap.
5. **Certificate and ingress values remain unresolved.** Verify the ACM certificate is in `ap-south-2`, is issued, covers the approved hostname, and that ingress CIDRs are the testers' current public IP ranges. Do not widen ingress to `0.0.0.0/0`.
6. **Terraform has not been validated against the target AWS account.** CI checks formatting, configuration validation, and source-level security invariants; it does not query the user's AWS account. Run a reviewed `terraform plan` with non-secret inputs after prerequisites are known. A plan is not authorization to apply.

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

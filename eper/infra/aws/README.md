# EPER isolated AWS UAT — provisioning checklist

Target region: `ap-south-2` (Hyderabad). Scope remains unchanged: 228 requirements across 38 chapters.

## Before creating resources

1. Confirm the AWS account and operator access in `ap-south-2`.
2. Choose the UAT hostname, for example `eper-uat.example.com`, and create/validate an ACM certificate for that hostname in `ap-south-2`.
3. Identify the approved tester egress IPv4 CIDR(s). Keep access restricted; do not open UAT to `0.0.0.0/0`.
4. Decide who owns DNS and the teardown date. The Application Load Balancer, Fargate, public IPv4, ECR, and logs can incur charges.
5. Keep AWS credentials out of Git. Prefer GitHub OIDC with a narrowly scoped IAM role for later automated deploys; do not create long-lived access keys for Actions.

## Required sequence

- Provision isolated ECR/ECS Fargate/HTTPS load-balancer resources only after the above values are known and the plan is reviewed.
- Build the container from an approved commit and tag it with that exact 40-character commit SHA.
- Deploy that image, then verify `GET /health` over HTTPS reports the same SHA.
- Run the remote authorized-target preflight only after the endpoint and GitHub Environment `eper-business-uat` variable `UAT_ALLOWED_HOST` are configured.
- Health and build identity are operational checks only. They do not execute the 228 requirements or grant UAT acceptance, certification, or release authorization.

## Values needed to prepare the first reviewed plan

- AWS account access confirmed (do not post credentials or access keys).
- UAT DNS hostname.
- ACM certificate ARN in `ap-south-2`.
- Approved tester IPv4 CIDR(s).
- Confirmation that using the account's default VPC/public subnets is acceptable for this isolated UAT target.

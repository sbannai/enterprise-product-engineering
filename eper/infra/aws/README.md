# EPER isolated AWS UAT — provisioning checklist

Target region: `ap-south-2` (Hyderabad). Scope remains unchanged: **228 requirements across 38 chapters**.

## Safety status

This repository contains a Terraform configuration and preflight checks only. No AWS resources have been provisioned. Do not run `terraform apply` until the reviewed plan, required inputs, cost owner, and teardown date are explicitly approved.

## Required account-specific inputs

1. AWS account and operator access confirmed in `ap-south-2` (never paste credentials or access keys into GitHub or chat).
2. Explicit VPC ID for the isolated UAT environment. Terraform intentionally does not assume the default VPC.
3. At least two **public ALB subnets** in distinct Availability Zones, with routes to an internet gateway.
4. Separate **private Fargate task subnet(s)** in the same VPC, with outbound access to pull the image and send logs (for example NAT or suitable VPC endpoints). Tasks do not receive public IPs.
5. UAT DNS hostname and an ACM certificate for that hostname in `ap-south-2`.
6. Approved tester public IPv4 CIDR(s); never open HTTPS ingress to `0.0.0.0/0`.
7. Confirmed DNS owner, cost owner, and planned teardown date.

## Required sequence

- Review the Terraform code and a non-applying plan using the actual account-specific inputs.
- Review estimated costs for the Application Load Balancer, Fargate, public IPv4, ECR, and CloudWatch logs.
- Only after explicit authorization, provision the infrastructure and push an approved container image tagged with the exact 40-character source commit SHA.
- Deploy that image, then verify `GET /health` over HTTPS reports the same SHA.
- Run the remote authorized-target preflight only after the endpoint and GitHub Environment `eper-business-uat` variable `UAT_ALLOWED_HOST` are configured.
- Treat health and build identity as operational checks only. They do not execute the 228 requirements or grant business UAT acceptance, certification, or release authorization.

## Input template

Use `uat-inputs.example.env` as a checklist only. It is not a Terraform `.tfvars` file, does not validate account resources, and must not contain credentials. Keep `ALLOW_CHARGEABLE_PROVISIONING=false` until an explicit cost and provisioning approval is recorded.

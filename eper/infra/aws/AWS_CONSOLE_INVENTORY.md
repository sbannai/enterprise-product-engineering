# EPER UAT AWS inventory — Console fallback

Target region: **Asia Pacific (Hyderabad), `ap-south-2`**.

This is a read-only discovery checklist. Do not create, modify, or delete AWS resources while collecting these details. Do not share access keys, secret keys, session tokens, passwords, or screenshots containing credentials.

## 1. Confirm the account and region

1. Sign in to the AWS Console using your normal approved access method.
2. In the top-right region selector, choose **Asia Pacific (Hyderabad) `ap-south-2`**.
3. Open **IAM / account menu** only as needed to confirm which account you are viewing. Keep the account ID private if preferred.

## 2. Record VPCs and subnets

1. Open **VPC → Your VPCs**.
2. Record the candidate VPC ID, IPv4 CIDR, and whether it is the default VPC.
3. Open **VPC → Subnets** and filter by that VPC ID.
4. For each candidate subnet, record subnet ID, Availability Zone, CIDR, and whether **Auto-assign public IPv4 address** is enabled.
5. We need at least two load-balancer subnets in different Availability Zones and separate task subnets for private Fargate tasks. Do not assume that the public-IP setting alone proves a subnet is public or private.

## 3. Check routes and gateways

1. Open **VPC → Route tables** and inspect the route table associated with each candidate subnet.
2. For load-balancer subnets, verify a default IPv4 route (`0.0.0.0/0`) to an Internet Gateway (`igw-...`).
3. For task subnets, verify there is **no** default route directly to an Internet Gateway. Review any NAT route, endpoint route, network ACL, and DNS configuration.
4. Open **VPC → Internet gateways** and confirm the relevant gateway is attached to the candidate VPC.
5. Open **VPC → Endpoints** and record existing endpoints for ECR API, ECR Docker, CloudWatch Logs, and S3, if any.

## 4. Check the TLS certificate

1. Open **AWS Certificate Manager (ACM)** while still in `ap-south-2`.
2. Record the certificate domain, ARN, and status for a certificate that covers the proposed UAT hostname.
3. The certificate must be issued and in the same region as the load balancer. If no hostname/certificate is approved, record **not available**; do not request or create one yet.

## 5. Return only these findings

Use this table in your reply. IDs and CIDRs are useful; do not send credentials.

| Item | Finding |
|---|---|
| Region | `ap-south-2` |
| Candidate VPC ID and CIDR | |
| Candidate ALB subnet IDs and AZs (at least two AZs) | |
| ALB subnet route tables have IGW default route? | |
| Candidate private task subnet IDs and AZs | |
| Task subnet default route target(s) | |
| Required VPC endpoints present? | |
| ACM certificate status and covered hostname | |
| Approved tester public CIDR(s) | |
| UAT hostname and DNS owner | |
| Cost owner and teardown date | |

If a value is unknown, write **unknown** rather than guessing.

## Safety gate

Inventory is not authorization to provision. Before any Terraform apply, the team must review an account-specific non-applying plan, estimate costs, verify the routing/security design, record the owner and teardown date, and obtain explicit provisioning approval. This document does not authorize chargeable resources. Passing infrastructure checks does not execute the 228 requirement tests or constitute business UAT acceptance.

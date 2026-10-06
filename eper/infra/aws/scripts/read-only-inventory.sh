#!/usr/bin/env bash
# Read-only inventory for EPER UAT preparation.
# This script does not create, modify, or delete AWS resources.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-2}"

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: AWS CLI is not installed." >&2
  exit 1
fi

if ! aws sts get-caller-identity --output json >/dev/null; then
  echo "ERROR: AWS CLI credentials/profile are not configured or not authorized." >&2
  exit 1
fi

echo "== Caller identity (review locally; account ID is shown) =="
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output table

echo
echo "== VPCs in ${REGION} =="
aws ec2 describe-vpcs --region "$REGION" \
  --query 'Vpcs[].{VpcId:VpcId,Default:IsDefault,CIDR:CidrBlock,State:State}' \
  --output table

echo
echo "== Subnets in ${REGION} =="
aws ec2 describe-subnets --region "$REGION" \
  --query 'Subnets[].{SubnetId:SubnetId,VpcId:VpcId,AZ:AvailabilityZone,CIDR:CidrBlock,AutoPublicIP:MapPublicIpOnLaunch}' \
  --output table

echo
echo "== Internet gateway attachments =="
aws ec2 describe-internet-gateways --region "$REGION" \
  --query 'InternetGateways[].{GatewayId:InternetGatewayId,VpcIds:Attachments[].VpcId,State:Attachments[].State}' \
  --output table

echo
echo "== ACM certificates in ${REGION} =="
aws acm list-certificates --region "$REGION" \
  --query 'CertificateSummaryList[].{Domain:DomainName,ARN:CertificateArn,Status:Status}' \
  --output table

echo
echo "Inventory complete. This script is read-only; it does not validate DNS ownership, tester CIDRs, costs, or authorize Terraform apply."

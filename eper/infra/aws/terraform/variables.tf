variable "aws_region" {
  description = "AWS region for isolated EPER UAT."
  type        = string
  default     = "ap-south-2"
}

variable "name_prefix" {
  description = "Unique lowercase AWS resource prefix."
  type        = string
  default     = "eper-uat"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.name_prefix))
    error_message = "Use 3-20 lowercase letters, numbers, or hyphens, starting with a letter."
  }
}

variable "vpc_id" {
  description = "Explicit VPC ID for isolated EPER UAT; do not assume the default VPC."
  type        = string

  validation {
    condition     = can(regex("^vpc-[0-9a-f]+$", var.vpc_id))
    error_message = "Provide a valid VPC ID."
  }
}

variable "alb_subnet_ids" {
  description = "At least two ALB subnet IDs in different Availability Zones."
  type        = list(string)

  validation {
    condition     = length(var.alb_subnet_ids) >= 2
    error_message = "Provide at least two existing ALB subnets in different Availability Zones."
  }
}

variable "alb_route_table_ids" {
  description = "Route table IDs for ALB subnets; each must have a default route through an internet gateway."
  type        = list(string)

  validation {
    condition     = length(var.alb_route_table_ids) >= 2
    error_message = "Provide at least two ALB route table IDs."
  }
}

variable "task_subnet_ids" {
  description = "Private subnet IDs for Fargate tasks; provide egress via NAT or required VPC endpoints."
  type        = list(string)

  validation {
    condition     = length(var.task_subnet_ids) >= 1
    error_message = "Provide at least one existing task subnet."
  }
}

variable "task_route_table_ids" {
  description = "Route table IDs associated with private Fargate subnets; used for the S3 gateway endpoint."
  type        = list(string)

  validation {
    condition     = length(var.task_route_table_ids) >= 1
    error_message = "Provide at least one route table associated with the private task subnets."
  }
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in this region for the UAT hostname."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:acm:[a-z0-9-]+:", var.acm_certificate_arn))
    error_message = "A valid ACM certificate ARN is required for HTTPS."
  }
}

variable "allowed_ingress_cidrs" {
  description = "Approved client IPv4 CIDRs allowed to access UAT over HTTPS."
  type        = list(string)

  validation {
    condition     = length(var.allowed_ingress_cidrs) > 0 && alltrue([for cidr in var.allowed_ingress_cidrs : can(cidrnetmask(cidr)) && cidr != "0.0.0.0/0"])
    error_message = "Provide approved CIDRs and do not expose UAT to the entire internet."
  }
}

variable "image_tag" {
  description = "Immutable ECR image tag; exact lowercase commit SHA."
  type        = string

  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.image_tag))
    error_message = "image_tag must be a 40-character lowercase commit SHA."
  }
}

variable "build_id" {
  description = "Exact commit SHA embedded in the image."
  type        = string

  validation {
    condition     = can(regex("^[a-f0-9]{40}$", var.build_id))
    error_message = "build_id must be a 40-character lowercase commit SHA."
  }
}

variable "task_cpu" {
  type    = number
  default = 256
}

variable "task_memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  type    = number
  default = 1
}

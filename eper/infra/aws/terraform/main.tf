terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

data "aws_subnet" "alb" {
  for_each = toset(var.alb_subnet_ids)
  id       = each.value
}

data "aws_route_table" "alb" {
  for_each       = toset(var.alb_route_table_ids)
  route_table_id = each.value
}

data "aws_subnet" "tasks" {
  for_each = toset(var.task_subnet_ids)
  id       = each.value
}

resource "aws_ecr_repository" "eper_uat" {
  name                 = "${var.name_prefix}-api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "eper_uat" {
  repository = aws_ecr_repository.eper_uat.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Retain the newest 10 tagged release images"
      selection = {
        tagStatus     = "tagged"
        tagPrefixList = ["a", "b", "c", "d", "e", "f", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
        countType     = "imageCountMoreThan"
        countNumber   = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}

resource "aws_cloudwatch_log_group" "eper_uat" {
  name              = "/ecs/${var.name_prefix}"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb"
  description = "Ingress for isolated EPER UAT load balancer"
  vpc_id      = data.aws_vpc.selected.id

  ingress {
    description = "HTTPS from explicitly approved source CIDRs"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
  }

  egress {
    description = "Forward only within the selected VPC toward private UAT tasks"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  tags = local.tags
}

resource "aws_security_group" "tasks" {
  name        = "${var.name_prefix}-tasks"
  description = "Only the EPER UAT load balancer may reach the API"
  vpc_id      = data.aws_vpc.selected.id

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Reach only private addresses within the selected VPC, including required VPC endpoints"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  tags = local.tags
}

resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.name_prefix}-vpce"
  description = "HTTPS access to required private AWS service endpoints from EPER UAT tasks"
  vpc_id      = data.aws_vpc.selected.id

  ingress {
    description     = "HTTPS from EPER UAT tasks"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks.id]
  }

  tags = local.tags
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = data.aws_vpc.selected.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.task_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  tags                = local.tags
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = data.aws_vpc.selected.id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.task_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  tags                = local.tags
}

resource "aws_vpc_endpoint" "logs" {
  vpc_id              = data.aws_vpc.selected.id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.task_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  tags                = local.tags
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = data.aws_vpc.selected.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.task_route_table_ids
  tags              = local.tags
}

resource "aws_lb" "eper_uat" {
  name               = substr("${var.name_prefix}-alb", 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.alb_subnet_ids

  lifecycle {
    precondition {
      condition     = length(var.alb_subnet_ids) == length(toset(var.alb_subnet_ids))
      error_message = "ALB subnet IDs must be unique."
    }
    precondition {
      condition = length(distinct([
        for subnet in values(data.aws_subnet.alb) : subnet.availability_zone
      ])) >= 2
      error_message = "ALB subnets must span at least two distinct Availability Zones."
    }
    precondition {
      condition = alltrue([
        for subnet in values(data.aws_subnet.alb) : subnet.vpc_id == data.aws_vpc.selected.id
      ])
      error_message = "All ALB subnets must belong to the selected VPC."
    }
    precondition {
      condition = length(var.alb_route_table_ids) >= 2 && alltrue([
        for route_table in values(data.aws_route_table.alb) :
        route_table.vpc_id == data.aws_vpc.selected.id &&
        anytrue([for route in route_table.routes : can(regex("^igw-", route.gateway_id))])
      ])
      error_message = "Provide ALB route tables in the selected VPC with a default route through an internet gateway."
    }
  }

  tags = local.tags
}

resource "aws_lb_target_group" "eper_uat" {
  name        = substr("${var.name_prefix}-tg", 0, 32)
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.selected.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    matcher             = "200"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.tags
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.eper_uat.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.eper_uat.arn
  }
}

resource "aws_ecs_cluster" "eper_uat" {
  name = var.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.tags
}

resource "aws_iam_role" "execution" {
  name = "${var.name_prefix}-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "execution" {
  name = "${var.name_prefix}-execution-minimum"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRAuthorization"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "PullOnlyThisUATImage"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = aws_ecr_repository.eper_uat.arn
      },
      {
        Sid    = "WriteOnlyEPERUATLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.eper_uat.arn}:*"
      }
    ]
  })
}

resource "aws_ecs_task_definition" "eper_uat" {
  family                   = var.name_prefix
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name      = "eper-api"
    image     = "${aws_ecr_repository.eper_uat.repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{
      containerPort = 8080
      hostPort      = 8080
      protocol      = "tcp"
    }]
    # EPER_BUILD_ID is baked into the image during its build. Do not override it here.
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.eper_uat.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])

  lifecycle {
    precondition {
      condition     = var.image_tag == var.build_id
      error_message = "The ECR image tag must match the build ID embedded in the image."
    }
  }

  tags = local.tags
}

resource "aws_ecs_service" "eper_uat" {
  name            = "${var.name_prefix}-service"
  cluster         = aws_ecs_cluster.eper_uat.id
  task_definition = aws_ecs_task_definition.eper_uat.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = var.task_subnet_ids
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.eper_uat.arn
    container_name   = "eper-api"
    container_port   = 8080
  }

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy.execution,
  ]

  lifecycle {
    precondition {
      condition     = length(var.task_subnet_ids) == length(toset(var.task_subnet_ids))
      error_message = "Fargate task subnet IDs must be unique."
    }
    precondition {
      condition     = length(setintersection(toset(var.alb_subnet_ids), toset(var.task_subnet_ids))) == 0
      error_message = "ALB and Fargate task subnets must be separate subnet sets."
    }
    precondition {
      condition = alltrue([
        for subnet in values(data.aws_subnet.tasks) : subnet.vpc_id == data.aws_vpc.selected.id
      ])
      error_message = "All Fargate task subnets must belong to the selected VPC."
    }
  }

  tags = local.tags
}

locals {
  tags = {
    Project     = "EPER"
    Environment = "UAT"
    ManagedBy   = "Terraform"
    Release     = "NotProduction"
  }
}

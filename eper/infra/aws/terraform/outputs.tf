output "ecr_repository_url" {
  description = "ECR repository URL for the immutable image."
  value       = aws_ecr_repository.eper_uat.repository_url
}

output "load_balancer_dns_name" {
  description = "ALB DNS name; configure the approved UAT DNS record to point here."
  value       = aws_lb.eper_uat.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.eper_uat.name
}

output "ecs_service_name" {
  value = aws_ecs_service.eper_uat.name
}

output "cloudwatch_log_group" {
  value = aws_cloudwatch_log_group.eper_uat.name
}

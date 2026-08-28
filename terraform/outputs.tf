output "vpc_id" {
  description = "Dedicated DaxGov VPC ID."
  value       = aws_vpc.this.id
}

output "alb_dns_name" {
  description = "Public URL hostname for the SPA."
  value       = aws_lb.app.dns_name
}

output "app_url" {
  description = "Load balancer URL for DaxGov."
  value       = local.app_url
}

output "ecr_repository_url" {
  description = "Push the DaxGov image here before starting the ECS service."
  value       = aws_ecr_repository.app.repository_url
}

output "aurora_cluster_endpoint" {
  description = "Aurora writer endpoint. The app reads this from Secrets Manager, not from this output."
  value       = aws_rds_cluster.aurora.endpoint
}

output "database_secret_arn" {
  description = "Secrets Manager ARN for the Aurora master user. ECS tasks load DATABASE_URL from this secret."
  value       = aws_rds_cluster.aurora.master_user_secret[0].secret_arn
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "kms_key_arn" {
  description = "Customer managed KMS key used to encrypt Aurora, ECR, logs, secrets, and Fargate ephemeral storage."
  value       = aws_kms_key.this.arn
}

output "kms_key_alias" {
  description = "Alias for the DaxGov customer managed KMS key."
  value       = aws_kms_alias.this.name
}

output "vpc_id" {
  description = "Dedicated DaxGov VPC ID."
  value       = aws_vpc.this.id
}

output "alb_dns_name" {
  description = "Internal ALB hostname. Traffic should enter through CloudFront, not this name."
  value       = aws_lb.app.dns_name
}

output "app_url" {
  description = "HTTPS URL for DaxGov (custom domain, or the CloudFront default domain when DNS is not configured)."
  value       = local.app_url
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain. Use this if DNS is managed outside Route 53."
  value       = aws_cloudfront_distribution.app.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.app.id
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard for CloudFront, ALB, ECS, and Aurora."
  value       = aws_cloudwatch_dashboard.this.dashboard_name
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

output "app_secret_arn" {
  description = "Secrets Manager ARN for application secrets (SSO, bootstrap admin password, Model Garden JSON)."
  value       = aws_secretsmanager_secret.app.arn
}

output "app_config_parameter" {
  description = "SSM Parameter Store prefix for non-secret application config."
  value       = local.config_prefix
}

output "origin_verify_secret_arn" {
  description = "Secrets Manager ARN for the CloudFront origin-verify header."
  value       = aws_secretsmanager_secret.origin_verify.arn
}

output "application_log_group" {
  description = "CloudWatch Logs group for DaxGov application logs."
  value       = aws_cloudwatch_log_group.app.name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

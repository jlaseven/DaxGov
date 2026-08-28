variable "aws_region" {
  type        = string
  description = "AWS region for the dedicated DaxGov VPC and all regional resources."
  default     = "ap-southeast-1"
}

variable "name" {
  type        = string
  description = "Short name used for resource name prefixes."
  default     = "daxgov"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR for the dedicated DaxGov VPC. Do not share this VPC with other apps."
  default     = "10.80.0.0/16"
}

variable "database_name" {
  type        = string
  description = "Aurora PostgreSQL database name."
  default     = "daxgov"
}

variable "database_username" {
  type        = string
  description = "Aurora master username. The password is generated and stored in Secrets Manager."
  default     = "daxgov"
}

variable "aurora_engine_version" {
  type        = string
  description = "Aurora PostgreSQL engine version."
  default     = "16.6"
}

variable "aurora_min_acu" {
  type        = number
  description = "Aurora Serverless v2 minimum capacity (ACUs)."
  default     = 0.5
}

variable "aurora_max_acu" {
  type        = number
  description = "Aurora Serverless v2 maximum capacity (ACUs)."
  default     = 4
}

variable "desired_count" {
  type        = number
  description = "Number of ECS tasks. Set to 0 for the first apply if the container image has not been pushed yet."
  default     = 1
}

variable "image_tag" {
  type        = string
  description = "ECR image tag to deploy."
  default     = "latest"
}

variable "container_port" {
  type        = number
  description = "Container listen port."
  default     = 8080
}

variable "cpu" {
  type        = number
  description = "ECS Fargate CPU units."
  default     = 512
}

variable "memory" {
  type        = number
  description = "ECS Fargate memory in MiB."
  default     = 1024
}

variable "certificate_arn" {
  type        = string
  description = "Optional ACM certificate ARN. When set, the load balancer listens on HTTPS 443 and redirects HTTP to HTTPS."
  default     = ""
}

variable "allowed_ingress_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to reach the load balancer."
  default     = ["0.0.0.0/0"]
}

variable "deletion_protection" {
  type        = bool
  description = "Protect Aurora from deletion."
  default     = true
}

variable "backup_retention_days" {
  type        = number
  description = "Aurora backup retention in days."
  default     = 7
}

variable "allowed_origins" {
  type        = string
  description = "Optional extra CORS origins, comma-separated. Same-origin browser requests are already allowed."
  default     = ""
}

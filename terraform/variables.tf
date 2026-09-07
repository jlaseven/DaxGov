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

variable "environment" {
  type        = string
  description = "Target environment name. Applied to default tags, Parameter Store `NODE_ENV`, and used to distinguish this stack."
  default     = "sandbox"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR for the dedicated DaxGov VPC. Must not overlap a VPC you might peer later. Do not reuse segs-prod 10.80.0.0/16."
  default     = "10.82.0.0/16"
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
  default     = "16.8"
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
  description = "Regional Amazon-issued ACM certificate ARN for the internal ALB. Leave empty to issue and auto-renew one in Route 53 when route53_zone_id is set. Imported certificates are not renewed by ACM."
  default     = ""
}

variable "cloudfront_certificate_arn" {
  type        = string
  description = "us-east-1 Amazon-issued ACM certificate ARN for CloudFront aliases. Leave empty to issue and auto-renew one in Route 53, or to use the default *.cloudfront.net certificate. Imported certificates are not renewed by ACM."
  default     = ""
}

variable "domain_name" {
  type        = string
  description = "Optional public hostname (e.g. daxgov.example.com). Leave empty to use the CloudFront default domain and HTTP from CloudFront to the internal ALB. When set, also set certificate_arn or route53_zone_id."
  default     = ""

  validation {
    condition     = !can(regex("://", var.domain_name))
    error_message = "Set domain_name to a hostname such as daxgov.example.com, without https://, or leave it empty."
  }
}

variable "route53_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID. Used to validate ACM certificates and create an alias to CloudFront when certificate ARNs are omitted."
  default     = ""
}

variable "allowed_ingress_cidrs" {
  type        = list(string)
  description = "Optional extra CIDR blocks allowed to reach the internal ALB on 443, in addition to CloudFront VPC origins."
  default     = []
}

variable "deletion_protection" {
  type        = bool
  description = "Protect Aurora from deletion."
  default     = true
}

variable "allowed_origins" {
  type        = string
  description = "Optional extra CORS origins, comma-separated. Same-origin browser requests are already allowed."
  default     = ""
}

variable "jumpcloud_client_id" {
  type        = string
  description = "JumpCloud OIDC client ID. Stored in Parameter Store."
  default     = ""
}

variable "jumpcloud_client_secret" {
  type        = string
  sensitive   = true
  description = "JumpCloud OIDC client secret. Stored in Secrets Manager."
  default     = ""
}

variable "jumpcloud_issuer" {
  type        = string
  description = "JumpCloud OIDC issuer URL. Stored in Parameter Store."
  default     = ""
}

variable "jumpcloud_redirect_uri" {
  type        = string
  description = "JumpCloud OIDC redirect URI. Stored in Parameter Store. Leave empty to use the request origin."
  default     = ""
}

variable "jumpcloud_sso_protocol" {
  type        = string
  description = "Preferred SSO protocol when both OIDC and SAML are configured (oidc or saml)."
  default     = ""
}

variable "jumpcloud_disable_password" {
  type        = bool
  description = "When true, hide local password login after JumpCloud SSO is configured."
  default     = false
}

variable "jumpcloud_email_domains" {
  type        = string
  description = "Comma-separated email domains allowed for JumpCloud SSO."
  default     = ""
}

variable "jumpcloud_saml_entrypoint" {
  type        = string
  description = "JumpCloud SAML SSO URL. Stored in Parameter Store."
  default     = ""
}

variable "jumpcloud_saml_idp_cert" {
  type        = string
  sensitive   = true
  description = "JumpCloud SAML IdP certificate PEM. Stored in Secrets Manager."
  default     = ""
}

variable "jumpcloud_saml_issuer" {
  type        = string
  description = "JumpCloud SAML SP entity ID. Stored in Parameter Store."
  default     = ""
}

variable "jumpcloud_saml_callback_url" {
  type        = string
  description = "JumpCloud SAML ACS URL. Stored in Parameter Store."
  default     = ""
}

variable "jumpcloud_saml_idp_entity_id" {
  type        = string
  description = "JumpCloud SAML IdP entity ID. Stored in Parameter Store."
  default     = ""
}

variable "bootstrap_admin_password" {
  type        = string
  sensitive   = true
  description = "First-admin password written to Secrets Manager. Leave empty to generate one. Retrieve it from /{name}/{environment}/app after apply."
  default     = ""
}

variable "google_application_credentials_json" {
  type        = string
  sensitive   = true
  description = "Google Model Garden service-account JSON. Stored in Secrets Manager. Leave empty to disable Vertex research."
  default     = ""
}

variable "google_cloud_project" {
  type        = string
  description = "Google Cloud project for Model Garden. Stored in Parameter Store."
  default     = ""
}

variable "model_garden_kimi_model" {
  type        = string
  description = "Vertex Model Garden id for Kimi."
  default     = "moonshotai/kimi-k2-thinking-maas"
}

variable "model_garden_glm_model" {
  type        = string
  description = "Vertex Model Garden id for GLM."
  default     = "zai-org/glm-5.2-maas"
}

variable "asset_research_disabled" {
  type        = bool
  description = "When true, disable information-asset research."
  default     = false
}

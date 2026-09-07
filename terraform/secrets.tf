resource "random_password" "bootstrap_admin" {
  length           = 24
  special          = true
  override_special = "-_"
  min_lower        = 2
  min_upper        = 2
  min_numeric      = 2
}

resource "random_password" "oidc_state" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "origin_verify" {
  name                    = "/${var.name}/${var.environment}/origin-verify"
  description             = "CloudFront to ALB origin-verify header for ${var.name}"
  kms_key_id              = aws_kms_key.this.arn
  recovery_window_in_days = 7

  tags = {
    Name = "${var.name}-origin-verify"
  }
}

resource "aws_secretsmanager_secret_version" "origin_verify" {
  secret_id     = aws_secretsmanager_secret.origin_verify.id
  secret_string = random_password.origin_verify.result
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "/${var.name}/${var.environment}/app"
  description             = "Application secrets for ${var.name} (${var.environment})"
  kms_key_id              = aws_kms_key.this.arn
  recovery_window_in_days = 7

  tags = {
    Name = "${var.name}-app-secrets"
  }
}

locals {
  bootstrap_admin_password = (
    var.bootstrap_admin_password != ""
    ? var.bootstrap_admin_password
    : random_password.bootstrap_admin.result
  )
  app_secrets = {
    BOOTSTRAP_ADMIN_PASSWORD             = local.bootstrap_admin_password
    OIDC_STATE_SECRET                    = random_password.oidc_state.result
    JUMPCLOUD_CLIENT_SECRET              = var.jumpcloud_client_secret
    JUMPCLOUD_SAML_IDP_CERT              = var.jumpcloud_saml_idp_cert
    GOOGLE_APPLICATION_CREDENTIALS_JSON  = var.google_application_credentials_json
  }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(local.app_secrets)
}

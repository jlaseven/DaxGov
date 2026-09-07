locals {
  config_prefix = "/${var.name}/${var.environment}/config"
  app_config = {
    NODE_ENV                     = var.environment
    HOST                         = "0.0.0.0"
    PORT                         = tostring(var.container_port)
    SERVE_SPA                    = "true"
    TRUST_PROXY                  = "true"
    COOKIE_SECURE                = "true"
    TLS_ENABLED                  = "true"
    TLS_CERT_DAYS                = "14"
    TLS_ROTATE_EVERY_MS          = tostring(7 * 24 * 60 * 60 * 1000)
    DATABASE_NAME                = var.database_name
    ALLOWED_ORIGINS              = join(",", local.allowed_origin_values)
    BCRYPT_COST                  = "12"
    LOGIN_MAX_ATTEMPTS           = "5"
    LOGIN_WINDOW_MS              = "900000"
    API_RATE_LIMIT               = "300"
    API_RATE_WINDOW_MS           = "60000"
    SSO_MAX_ATTEMPTS             = "20"
    SSO_WINDOW_MS                = "900000"
    PASSWORD_CHANGE_MAX_ATTEMPTS = "5"
    PASSWORD_CHANGE_WINDOW_MS    = "900000"
    ASSET_RESEARCH_DISABLED      = var.asset_research_disabled ? "true" : "false"
    MODEL_GARDEN_KIMI_MODEL      = var.model_garden_kimi_model
    MODEL_GARDEN_GLM_MODEL       = var.model_garden_glm_model
    GOOGLE_CLOUD_PROJECT         = var.google_cloud_project
    JUMPCLOUD_CLIENT_ID          = var.jumpcloud_client_id
    JUMPCLOUD_ISSUER             = var.jumpcloud_issuer
    JUMPCLOUD_REDIRECT_URI       = var.jumpcloud_redirect_uri
    JUMPCLOUD_SSO_PROTOCOL       = var.jumpcloud_sso_protocol
    JUMPCLOUD_DISABLE_PASSWORD   = var.jumpcloud_disable_password ? "true" : "false"
    JUMPCLOUD_EMAIL_DOMAINS      = var.jumpcloud_email_domains
    JUMPCLOUD_SAML_ENTRYPOINT    = var.jumpcloud_saml_entrypoint
    JUMPCLOUD_SAML_ISSUER        = var.jumpcloud_saml_issuer
    JUMPCLOUD_SAML_CALLBACK_URL  = var.jumpcloud_saml_callback_url
    JUMPCLOUD_SAML_IDP_ENTITY_ID = var.jumpcloud_saml_idp_entity_id
    SKIP_DB_MIGRATE              = "false"
  }
}

resource "aws_ssm_parameter" "config" {
  for_each = {
    for key, value in local.app_config : key => value if trimspace(value) != ""
  }

  name        = "${local.config_prefix}/${each.key}"
  description = "DaxGov ${var.environment} config ${each.key}"
  type        = "String"
  value       = each.value
  tier        = "Standard"

  tags = {
    Name = "${var.name}-${each.key}"
  }
}

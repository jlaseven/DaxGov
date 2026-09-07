locals {
  has_domain            = trimspace(var.domain_name) != ""
  issue_alb_cert        = var.certificate_arn == "" && var.route53_zone_id != "" && local.has_domain
  issue_cloudfront_cert = var.cloudfront_certificate_arn == "" && var.route53_zone_id != "" && local.has_domain
  alb_certificate_arn = (
    var.certificate_arn != ""
    ? var.certificate_arn
    : try(aws_acm_certificate_validation.alb[0].certificate_arn, "")
  )
  cloudfront_certificate_arn = (
    var.cloudfront_certificate_arn != ""
    ? var.cloudfront_certificate_arn
    : try(aws_acm_certificate_validation.cloudfront[0].certificate_arn, "")
  )
  alb_https_enabled  = local.alb_certificate_arn != ""
  cloudfront_aliases = local.cloudfront_certificate_arn != "" && local.has_domain ? [var.domain_name] : []
  app_url = (
    length(local.cloudfront_aliases) > 0
    ? "https://${var.domain_name}"
    : "https://${aws_cloudfront_distribution.app.domain_name}"
  )
  # CloudFront uses AllViewerExceptHostHeader, so the app sees the ALB Host, not
  # the CloudFront domain. Browser POSTs still send Origin as the CDN URL, which
  # must be allowlisted or login returns 403 Forbidden.
  allowed_origin_values = distinct(compact(concat(
    [local.app_url],
    [for origin in split(",", var.allowed_origins) : trimspace(origin)],
  )))
}

resource "aws_acm_certificate" "alb" {
  count             = local.issue_alb_cert ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  options {
    certificate_transparency_logging_preference = "ENABLED"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "cloudfront" {
  count             = local.issue_cloudfront_cert ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  options {
    certificate_transparency_logging_preference = "ENABLED"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "alb_cert" {
  for_each = local.issue_alb_cert ? {
    for dvo in aws_acm_certificate.alb[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
}

resource "aws_route53_record" "cloudfront_cert" {
  for_each = local.issue_cloudfront_cert ? {
    for dvo in aws_acm_certificate.cloudfront[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
}

resource "aws_acm_certificate_validation" "alb" {
  count                   = local.issue_alb_cert ? 1 : 0
  certificate_arn         = aws_acm_certificate.alb[0].arn
  validation_record_fqdns = [for record in aws_route53_record.alb_cert : record.fqdn]
}

resource "aws_acm_certificate_validation" "cloudfront" {
  count                   = local.issue_cloudfront_cert ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cloudfront[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cloudfront_cert : record.fqdn]
}

resource "aws_cloudwatch_metric_alarm" "alb_cert_expiry" {
  count               = local.alb_certificate_arn != "" ? 1 : 0
  alarm_name          = "${var.name}-alb-cert-expiry"
  alarm_description   = "ALB ACM certificate is within 30 days of expiry. Amazon-issued certificates should auto-renew while the DNS validation records remain."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DaysToExpiry"
  namespace           = "AWS/CertificateManager"
  period              = 86400
  statistic           = "Minimum"
  threshold           = 30
  treat_missing_data  = "notBreaching"

  dimensions = {
    CertificateArn = local.alb_certificate_arn
  }
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_cert_expiry" {
  count               = local.cloudfront_certificate_arn != "" ? 1 : 0
  provider            = aws.us_east_1
  alarm_name          = "${var.name}-cloudfront-cert-expiry"
  alarm_description   = "CloudFront ACM certificate is within 30 days of expiry. Amazon-issued certificates should auto-renew while the DNS validation records remain."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DaysToExpiry"
  namespace           = "AWS/CertificateManager"
  period              = 86400
  statistic           = "Minimum"
  threshold           = 30
  treat_missing_data  = "notBreaching"

  dimensions = {
    CertificateArn = local.cloudfront_certificate_arn
  }
}

resource "aws_route53_record" "app" {
  count   = var.route53_zone_id != "" && local.has_domain ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_ipv6" {
  count   = var.route53_zone_id != "" && local.has_domain ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

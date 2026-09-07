resource "random_password" "origin_verify" {
  length  = 32
  special = false
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "DaxGov HTTPS CDN in front of the dedicated VPC ALB"
  price_class     = "PriceClass_200"
  aliases         = local.cloudfront_aliases
  http_version    = "http2and3"

  origin {
    domain_name = aws_lb.app.dns_name
    origin_id   = "${var.name}-alb"

    custom_header {
      name  = "X-Origin-Verify"
      value = aws_secretsmanager_secret_version.origin_verify.secret_string
    }

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = local.alb_https_enabled ? "https-only" : "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_keepalive_timeout = 5
      origin_read_timeout      = 60
    }
  }

  default_cache_behavior {
    target_origin_id         = "${var.name}-alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.cloudfront_certificate_arn == ""
    acm_certificate_arn            = local.cloudfront_certificate_arn == "" ? null : local.cloudfront_certificate_arn
    ssl_support_method             = local.cloudfront_certificate_arn == "" ? null : "sni-only"
    minimum_protocol_version       = local.cloudfront_certificate_arn == "" ? "TLSv1" : "TLSv1.2_2021"
  }

  depends_on = [aws_lb_listener_rule.from_cloudfront]
}

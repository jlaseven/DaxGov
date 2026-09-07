resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = var.name

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 2
        properties = {
          markdown = "## DaxGov HTTPS path\nCloudFront (HTTPS) → internal ALB in the dedicated VPC (HTTPS) → ECS Fargate (HTTPS). Aurora stays on private data subnets."
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 2
        width  = 12
        height = 6
        properties = {
          title  = "CloudFront requests"
          region = "us-east-1"
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/CloudFront", "Requests", "DistributionId", aws_cloudfront_distribution.app.id, "Region", "Global"],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 2
        width  = 12
        height = 6
        properties = {
          title  = "CloudFront error rates"
          region = "us-east-1"
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/CloudFront", "4xxErrorRate", "DistributionId", aws_cloudfront_distribution.app.id, "Region", "Global"],
            [".", "5xxErrorRate", ".", ".", ".", "."],
            [".", "TotalErrorRate", ".", ".", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 8
        width  = 12
        height = 6
        properties = {
          title  = "ALB requests and responses"
          region = var.aws_region
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.app.arn_suffix],
            [".", "HTTPCode_Target_2XX_Count", ".", "."],
            [".", "HTTPCode_Target_5XX_Count", ".", "."],
            [".", "HTTPCode_ELB_5XX_Count", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 8
        width  = 12
        height = 6
        properties = {
          title  = "ALB target health and latency"
          region = var.aws_region
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Average", label = "Target response time" }],
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Average", label = "Healthy hosts" }],
            ["AWS/ApplicationELB", "UnHealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Average", label = "Unhealthy hosts" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 12
        height = 6
        properties = {
          title  = "ECS CPU and memory"
          region = var.aws_region
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 14
        width  = 12
        height = 6
        properties = {
          title  = "ECS running tasks"
          region = var.aws_region
          stat   = "Average"
          period = 60
          metrics = [
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", aws_ecs_service.app.name],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 20
        width  = 12
        height = 6
        properties = {
          title  = "Aurora capacity and CPU"
          region = var.aws_region
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/RDS", "ServerlessDatabaseCapacity", "DBClusterIdentifier", aws_rds_cluster.aurora.id],
            [".", "ACUUtilization", ".", "."],
            [".", "CPUUtilization", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 20
        width  = 12
        height = 6
        properties = {
          title  = "Aurora connections"
          region = var.aws_region
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBClusterIdentifier", aws_rds_cluster.aurora.id],
          ]
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 26
        width  = 24
        height = 6
        properties = {
          title  = "ECS application logs"
          region = var.aws_region
          query  = "SOURCE '${aws_cloudwatch_log_group.app.name}' | fields @timestamp, @message | filter @message like /http_request|activity|unhandled_error|startup/ | sort @timestamp desc | limit 50"
        }
      },
    ]
  })
}

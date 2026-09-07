resource "aws_ecs_cluster" "this" {
  name = var.name

  configuration {
    managed_storage_configuration {
      fargate_ephemeral_storage_kms_key_id = aws_kms_key.this.arn
    }
  }

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  depends_on = [aws_cloudwatch_log_group.container_insights]
}

locals {
  ecs_secrets = concat(
    [
      for key, param in aws_ssm_parameter.config : {
        name      = key
        valueFrom = param.arn
      }
    ],
    [
      for key in keys(local.app_secrets) : {
        name      = key
        valueFrom = "${aws_secretsmanager_secret.app.arn}:${key}::"
      }
    ],
  )
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.name
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = var.name
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true
      user      = "1001:1001"
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "AWS_REGION", value = var.aws_region },
        { name = "DATABASE_SECRET_ARN", value = aws_rds_cluster.aurora.master_user_secret[0].secret_arn },
        { name = "DATABASE_HOST", value = aws_rds_cluster.aurora.endpoint },
        { name = "APP_SECRET_ARN", value = aws_secretsmanager_secret.app.arn },
        { name = "APP_CONFIG_PARAMETER", value = local.config_prefix }
      ]
      secrets = local.ecs_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "app"
          mode                  = "non-blocking"
          max-buffer-size       = "25m"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"require('https').get('https://127.0.0.1:${var.container_port}/health',{rejectUnauthorized:false},(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 120
      }
    }
  ])

  depends_on = [aws_rds_cluster_instance.aurora, aws_secretsmanager_secret_version.app]
}

resource "aws_ecs_service" "app" {
  name            = var.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 180

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = var.name
    container_port   = var.container_port
  }

  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener.http,
    aws_lb_listener_rule.from_cloudfront,
    aws_iam_role_policy.task,
    aws_iam_role_policy.execution_kms,
    aws_iam_role_policy.execution_logs,
    aws_iam_role_policy.execution_ecr,
    aws_iam_role_policy.execution_runtime_config,
    aws_internet_gateway.this,
  ]
}

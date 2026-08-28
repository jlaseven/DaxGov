resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.name
  cpu                      = var.cpu
  memory                   = var.memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = var.name
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "HOST", value = "0.0.0.0" },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "SERVE_SPA", value = "true" },
        { name = "TRUST_PROXY", value = "true" },
        { name = "COOKIE_SECURE", value = local.https_enabled ? "true" : "false" },
        { name = "DATABASE_SECRET_ARN", value = aws_rds_cluster.aurora.master_user_secret[0].secret_arn },
        { name = "DATABASE_NAME", value = var.database_name },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "ALLOWED_ORIGINS", value = var.allowed_origins }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = var.name
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:${var.container_port}/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 120
      }
    }
  ])

  depends_on = [aws_rds_cluster_instance.aurora]
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
    subnets          = aws_subnet.app[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = var.name
    container_port   = var.container_port
  }

  depends_on = [
    aws_lb_listener.http,
    aws_lb_listener.http_redirect,
    aws_lb_listener.https,
    aws_iam_role_policy.task,
    aws_nat_gateway.this,
  ]
}

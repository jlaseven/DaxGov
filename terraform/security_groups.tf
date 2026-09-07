resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Internet-facing load balancer; CloudFront is the intended client and must send X-Origin-Verify"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "Listener from the internet; ALB still requires the CloudFront origin-verify header"
    from_port   = local.alb_https_enabled ? 443 : 80
    to_port     = local.alb_https_enabled ? 443 : 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.allowed_ingress_cidrs
    content {
      description = "Optional extra listener access"
      from_port   = local.alb_https_enabled ? 443 : 80
      to_port     = local.alb_https_enabled ? 443 : 80
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name}-alb"
  }
}

resource "aws_security_group" "app" {
  name        = "${var.name}-app"
  description = "ECS tasks running the DaxGov SPA and API"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "HTTPS from load balancer"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name}-app"
  }
}

resource "aws_security_group" "aurora" {
  name        = "${var.name}-aurora"
  description = "Aurora Serverless PostgreSQL, reachable only from DaxGov ECS tasks"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "PostgreSQL from app tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name}-aurora"
  }
}

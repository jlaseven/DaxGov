resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public load balancer for the DaxGov SPA"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
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
    description     = "From load balancer"
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

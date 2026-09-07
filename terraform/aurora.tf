resource "aws_db_subnet_group" "aurora" {
  name       = "${var.name}-aurora"
  subnet_ids = aws_subnet.data[*].id

  tags = {
    Name = "${var.name}-aurora"
  }
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier = "${var.name}-aurora"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = var.aurora_engine_version
  database_name      = var.database_name
  master_username    = var.database_username

  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.this.arn

  db_subnet_group_name      = aws_db_subnet_group.aurora.name
  vpc_security_group_ids    = [aws_security_group.aurora.id]
  storage_encrypted         = true
  kms_key_id                = aws_kms_key.this.arn
  backup_retention_period   = 1
  skip_final_snapshot       = true
  deletion_protection       = var.deletion_protection
  enable_http_endpoint      = false

  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_acu
    max_capacity = var.aurora_max_acu
  }

  tags = {
    Name = "${var.name}-aurora"
  }
}

resource "aws_rds_cluster_instance" "aurora" {
  identifier          = "${var.name}-aurora-1"
  cluster_identifier  = aws_rds_cluster.aurora.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.aurora.engine
  engine_version      = aws_rds_cluster.aurora.engine_version
  publicly_accessible = false

  tags = {
    Name = "${var.name}-aurora-1"
  }
}

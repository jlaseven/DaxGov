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

  manage_master_user_password = true

  db_subnet_group_name      = aws_db_subnet_group.aurora.name
  vpc_security_group_ids    = [aws_security_group.aurora.id]
  storage_encrypted         = true
  copy_tags_to_snapshot     = true
  backup_retention_period   = var.backup_retention_days
  preferred_backup_window   = "16:00-17:00"
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = !var.deletion_protection
  final_snapshot_identifier = var.deletion_protection ? null : "${var.name}-aurora-final"
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

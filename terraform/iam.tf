data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "execution_ecr" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = [aws_ecr_repository.app.arn]
  }
}

resource "aws_iam_role_policy" "execution_ecr" {
  name   = "${var.name}-ecs-execution-ecr"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_ecr.json
}

data "aws_iam_policy_document" "execution_kms" {
  statement {
    sid = "FargateEphemeralStorage"
    actions = [
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:CreateGrant",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.this.arn]
  }
}

resource "aws_iam_role_policy" "execution_kms" {
  name   = "${var.name}-ecs-execution-kms"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_kms.json
}

data "aws_iam_policy_document" "execution_logs" {
  statement {
    sid = "WriteApplicationLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      aws_cloudwatch_log_group.app.arn,
      "${aws_cloudwatch_log_group.app.arn}:*",
    ]
  }

  statement {
    sid = "EncryptApplicationLogs"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.this.arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["logs.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "execution_logs" {
  name   = "${var.name}-ecs-execution-logs"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_logs.json
}

data "aws_iam_policy_document" "execution_runtime_config" {
  statement {
    sid     = "ReadAppSecret"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      aws_secretsmanager_secret.app.arn,
    ]
  }

  statement {
    sid = "ReadAppConfigParameters"
    actions = [
      "ssm:GetParameters",
      "ssm:GetParameter",
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.name}/${var.environment}/*",
    ]
  }

  statement {
    sid       = "DecryptAppSecret"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = [aws_kms_key.this.arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "execution_runtime_config" {
  name   = "${var.name}-ecs-execution-config"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_runtime_config.json
}

resource "aws_iam_role" "task" {
  name               = "${var.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "task" {
  statement {
    sid     = "ReadRuntimeSecrets"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      aws_rds_cluster.aurora.master_user_secret[0].secret_arn,
      aws_secretsmanager_secret.app.arn,
    ]
  }

  statement {
    sid = "ReadRuntimeParameters"
    actions = [
      "ssm:GetParametersByPath",
      "ssm:GetParameters",
      "ssm:GetParameter",
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.name}/${var.environment}/*",
    ]
  }

  statement {
    sid       = "DecryptRuntimeSecrets"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = [aws_kms_key.this.arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "${var.name}-ecs-task-secrets"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

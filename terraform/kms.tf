data "aws_caller_identity" "current" {}

data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}

locals {
  kms_log_group_arns = [
    "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.name}",
    "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/ecs/containerinsights/${var.name}/*",
  ]
}

data "aws_iam_policy_document" "kms" {
  statement {
    sid     = "EnableRootAccountAdministration"
    effect  = "Allow"
    actions = ["kms:*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }

    resources = ["*"]
  }

  statement {
    sid     = "AllowDeployRoleAdministration"
    effect  = "Allow"
    actions = ["kms:*"]

    principals {
      type        = "AWS"
      identifiers = [data.aws_iam_session_context.current.issuer_arn]
    }

    resources = ["*"]
  }

  statement {
    sid    = "AllowCloudWatchLogs"
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]

    principals {
      type        = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }

    resources = ["*"]

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = local.kms_log_group_arns
    }
  }

  statement {
    sid    = "AllowRdsAndSecretsManager"
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:CreateGrant",
      "kms:DescribeKey",
    ]

    principals {
      type = "Service"
      identifiers = [
        "rds.amazonaws.com",
        "secretsmanager.amazonaws.com",
      ]
    }

    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "AllowEcsFargateEphemeralGenerateDataKey"
    effect    = "Allow"
    actions   = ["kms:GenerateDataKeyWithoutPlaintext"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["fargate.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:aws:ecs:clusterAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:aws:ecs:clusterName"
      values   = [var.name]
    }
  }

  statement {
    sid       = "AllowEcsFargateEphemeralCreateGrant"
    effect    = "Allow"
    actions   = ["kms:CreateGrant"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["fargate.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:aws:ecs:clusterAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:aws:ecs:clusterName"
      values   = [var.name]
    }

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "kms:GrantOperations"
      values   = ["Decrypt"]
    }
  }

  statement {
    sid       = "AllowEcsSecretsDecrypt"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = ["*"]

    principals {
      type = "AWS"
      identifiers = [
        aws_iam_role.execution.arn,
        aws_iam_role.task.arn,
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "this" {
  description             = "Customer managed key for DaxGov storage encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.kms.json

  tags = {
    Name = "${var.name}-cmk"
  }
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.this.key_id
}

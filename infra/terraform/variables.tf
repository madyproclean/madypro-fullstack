variable "aws_region" {
  description = "AWS region for the madypro stack"
  type        = string
  default     = "eu-west-3"
}

variable "instance_type" {
  description = "EC2 instance type running the prod + dev docker-compose stacks"
  type        = string
  default     = "t3.micro"
}

variable "project" {
  description = "Name prefix used for tagging and resource names"
  type        = string
  default     = "madypro-prod"
}

variable "ssh_private_key_path" {
  description = "Local path to write the generated SSH private key"
  type        = string
  default     = "~/.ssh/madypro_prod_aws"
}

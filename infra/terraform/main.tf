# EC2 unique portant Traefik (infra/traefik/docker-compose.yml) + les stacks
# prod et dev (infra/compose/docker-compose.{prod,dev}.yml) : Postgres + API + Web.

data "aws_vpc" "default" {
  default = true
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "tls_private_key" "madypro_prod" {
  algorithm = "ED25519"
}

resource "aws_key_pair" "madypro_prod" {
  key_name   = "${var.project}-aws"
  public_key = tls_private_key.madypro_prod.public_key_openssh
}

resource "local_sensitive_file" "private_key" {
  content         = tls_private_key.madypro_prod.private_key_openssh
  filename        = pathexpand(var.ssh_private_key_path)
  file_permission = "0600"
}

resource "aws_security_group" "madypro_prod" {
  name        = "${var.project}-sg"
  description = "madypro prod+dev: SSH + HTTP/HTTPS"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH (key-only auth)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP (Traefik ACME HTTP-01 challenge + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "App ports directs (pas de domaine pour le moment) : web/api prod+dev"
    from_port   = 8080
    to_port     = 8083
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-sg"
  }
}

resource "aws_instance" "madypro_prod" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.madypro_prod.key_name
  vpc_security_group_ids = [aws_security_group.madypro_prod.id]

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
  }

  tags = {
    Name = "${var.project}-web"
  }
}

resource "aws_eip" "madypro_prod" {
  domain = "vpc"

  tags = {
    Name = "${var.project}-eip"
  }
}

# Association séparée de l'EIP : permet de terminer/recréer l'instance
# (terraform destroy -target=aws_instance.madypro_prod puis apply) sans
# perdre l'IP fixe entre deux sessions de travail.
resource "aws_eip_association" "madypro_prod" {
  instance_id   = aws_instance.madypro_prod.id
  allocation_id = aws_eip.madypro_prod.id
}

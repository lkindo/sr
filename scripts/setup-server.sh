#!/bin/bash
set -e

echo "=== 1. Expand Swap Memory to 4GB First (Prevent OOM) ==="
# 기존 스왑파일 /.swapfile 비활성화 및 삭제
if [ -f "/.swapfile" ] || swapon --show | grep -q "/.swapfile"; then
    echo "Deactivating existing /.swapfile..."
    sudo swapoff /.swapfile || true
    sudo rm -f /.swapfile || true
fi

# 신규 4GB 스왑 파일 생성
echo "Creating 4GB swapfile at /swapfile..."
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# /etc/fstab 등록 업데이트
sudo sed -i '/\.swapfile/d' /etc/fstab
if ! grep -q "/swapfile" /etc/fstab; then
    echo "/swapfile swap swap defaults 0 0" | sudo tee -a /etc/fstab
fi

echo "=== 2. System Package Update & Tools Installation ==="
sudo dnf install -y dnf-plugins-core git curl

echo "=== 3. Docker Installation ==="
# Docker 공식 CentOS 리포지토리 등록 (Oracle Linux 9와 호환)
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
# Docker 패키지 설치
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
# 서비스 등록 및 시작
sudo systemctl enable --now docker
# opc 유저를 docker 그룹에 추가
sudo usermod -aG docker opc

echo "=== 4. Firewall ==="
# 보안: 3001(스테이징 앱 직결) 포트는 더 이상 열지 않는다.
# 해당 경로는 nginx를 우회해 TLS가 없고 X-Real-IP를 클라이언트가 조작할 수 있었다.
# 외부 트래픽은 nginx(80/443)만 통과하며, 스테이징은 test.lkindo.kr 로 접근한다.
# (과거 규칙이 남아 있을 수 있으므로 명시적으로 제거한다)
if systemctl is-active --quiet firewalld; then
    echo "Removing legacy port 3001 rule from firewalld (if present)..."
    sudo firewall-cmd --permanent --remove-port=3001/tcp || true
    sudo firewall-cmd --reload || true
else
    echo "firewalld is not active, skipping firewall configuration."
fi

echo "=== Setup Completed Successfully ==="
echo "Please log out and log back in to apply docker group changes."

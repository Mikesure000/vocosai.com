#!/bin/bash
# ============================================================
# Voice of Consumer OS - 腾讯云一键部署脚本
# 用法: sudo bash deploy-vocos.sh
# 在 腾讯云 CVM (Ubuntu 22.04/24.04) 上运行
# ============================================================

set -euo pipefail

echo "========================================"
echo " VOS - 腾讯云生产部署"
echo " Domain: vocosai.com"
echo "========================================"

# ============================================================
# 第1步：安装系统依赖
# ============================================================
echo ""
echo "[1/6] 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq nginx python3 python3-pip certbot python3-certbot-nginx curl

# ============================================================
# 第2步：创建应用目录并部署代码
# ============================================================
echo ""
echo "[2/6] 部署应用代码到 /opt/vocosai ..."
mkdir -p /opt/vocosai

# 提示：替换为你的实际代码路径或使用 git clone
if [ -d "/opt/vocosai/.git" ]; then
    echo "  → 代码已存在，执行 git pull..."
    cd /opt/vocosai && git pull
else
    echo "  → 首次部署，克隆代码..."
    # 替换以下命令为你自己的仓库地址（如果不同的话）
    if command -v git &> /dev/null; then
        git clone https://github.com/Mikesure000/vocosai.com /tmp/vocos-tmp
        cp -r /tmp/vocos-tmp/fullstack/* /opt/vocosai/
        cp /tmp/vocos-tmp/sample_comments.* /opt/vocosai/ 2>/dev/null || true
        rm -rf /tmp/vocos-tmp
    else
        echo "ERROR: git 未安装，请手动复制代码到 /opt/vocosai/"
        exit 1
    fi
fi

# ============================================================
# 第3步：配置环境变量
# ============================================================
echo ""
echo "[3/6] 配置环境变量..."
if [ ! -f "/opt/vocosai/.env" ]; then
    cat > /opt/vocosai/.env << 'EOF'
VOC_HOST=127.0.0.1
VOC_PORT=8090

# 域名配置
VOC_PUBLIC_HOSTNAME=vocosai.com
VOC_PUBLIC_ALIASES=www.vocosai.com

# AI 提供商配置（请填入你的 API Key）
# DeepSeek: PROVIDER=deepseek, MODEL=deepseek-chat
# OpenAI:   PROVIDER=openai,  MODEL=gpt-4o-mini
VOC_AI_PROVIDER=deepseek
VOC_AI_MODEL=deepseek-chat
VOC_AI_API_KEY=your_deepseek_api_key_here
EOF
    echo "  → .env 文件已创建，请编辑 /opt/vocosai/.env 填入 VOC_AI_API_KEY"
else
    echo "  → .env 文件已存在，跳过"
fi

# ============================================================
# 第4步：配置 Nginx
# ============================================================
echo ""
echo "[4/6] 配置 Nginx..."
# 先备份默认配置
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    cp /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.bak
fi

# 复制 VOS 专用 Nginx 配置
if [ -f "/opt/vocosai/deploy/nginx-vocos.conf" ]; then
    cp /opt/vocosai/deploy/nginx-vocos.conf /etc/nginx/sites-available/vocosai.com
else
    echo "  → 未找到 nginx-vocos.conf，跳过。请手动配置 Nginx。"
fi

# 启用站点（如果尚未启用）
if [ ! -L "/etc/nginx/sites-enabled/vocosai.com" ]; then
    ln -s /etc/nginx/sites-available/vocosai.com /etc/nginx/sites-enabled/
fi

# 测试 Nginx 配置
nginx -t && echo "  → Nginx 配置测试通过" || echo "  → Nginx 配置有误，请检查"

# ============================================================
# 第5步：配置 systemd 服务
# ============================================================
echo ""
echo "[5/6] 配置 systemd 服务..."
cp /opt/vocosai/deploy/vocos.service /etc/systemd/system/vocos.service
systemctl daemon-reload
systemctl enable vocos.service
systemctl restart vocos.service
echo "  → VOS 服务已启动"

# ============================================================
# 第6步：申请 SSL 证书（Let's Encrypt）
# ============================================================
echo ""
echo "[6/6] 申请 Let's Encrypt SSL 证书..."
echo ""
echo "  ⚠️  重要：请确保域名 vocosai.com 已解析到本服务器 IP"
echo "  按 Enter 继续，或 Ctrl+C 取消后手动配置 DNS..."
read -p "  确认继续？[Enter] " -r

if systemctl is-active --quiet nginx; then
    certbot --nginx -d vocosai.com -d www.vocosai.com --non-interactive --agree-tos -m admin@vocosai.com || {
        echo ""
        echo "  ⚠️  SSL 申请失败，常见原因："
        echo "  1. 域名 DNS 尚未解析到本服务器"
        echo "  2. 端口 80/443 未开放（安全组）"
        echo "  3. 证书申请频率限制"
        echo ""
        echo "  你可以稍后手动运行："
        echo "  sudo certbot --nginx -d vocosai.com -d www.vocosai.com"
    }
else
    echo "  → Nginx 未运行，跳过 SSL 申请"
    echo "  稍后手动运行："
    echo "  sudo systemctl start nginx"
    echo "  sudo certbot --nginx -d vocosai.com -d www.vocosai.com"
fi

# ============================================================
# 完成
# ============================================================
echo ""
echo "========================================"
echo " 🎉 VOS 部署完成！"
echo "========================================"
echo ""
echo "  应用服务: sudo systemctl status vocos"
echo "  检查日志: sudo journalctl -u vocos -f"
echo "  重启服务: sudo systemctl restart vocos"
echo ""
echo "  Nginx:    sudo systemctl status nginx"
echo "  SSL 续期: sudo certbot renew (自动)"
echo ""
echo "  访问地址:"
echo "  → https://vocosai.com"
echo "  → https://www.vocosai.com"
echo ""
echo "  配置 AI Key:"
echo "  sudo nano /opt/vocosai/.env"
echo "  然后重启服务: sudo systemctl restart vocos"
echo ""
echo "========================================"

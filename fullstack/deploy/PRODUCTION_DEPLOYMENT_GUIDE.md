# 🚀 Voice of Consumer OS — 腾讯云生产部署手册

> **域名**: vocosai.com  
> **技术栈**: Python (标准库 HTTP Server) + Nginx + SQLite  
> **目标**: 从零到一，在腾讯云 CVM 上完成生产环境部署

---

## 目录

1. [前置准备](#1-前置准备)
2. [购买腾讯云 CVM](#2-购买腾讯云-cvm)
3. [配置安全组（开放端口）](#3-配置安全组开放端口)
4. [配置 DNS（域名解析）](#4-配置-dns域名解析)
5. [服务器部署 VOS（一键脚本）](#5-服务器部署-vos一键脚本)
6. [配置 AI API Key](#6-配置-ai-api-key)
7. [验证 & 测试](#7-验证--测试)
8. [日常运维](#8-日常运维)
9. [常见问题](#9-常见问题)

---

## 1. 前置准备

| 项目 | 状态 | 说明 |
|------|------|------|
| ✅ 域名 | `vocosai.com` | 已注册 |
| ✅ 腾讯云账号 | 已有 | 请确认已实名认证 |
| ✅ GitHub 仓库 | `Mikesure000/vocosai.com` | 代码已就绪 |

---

## 2. 购买腾讯云 CVM

### 推荐配置

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| 机型 | **轻量应用服务器** 或 **CVM** | 轻量服务器更便宜，CVM 更灵活 |
| 地域 | **上海** 或 **北京** | 离目标用户最近即可 |
| CPU | **2核** | 够用 |
| 内存 | **4GB** | 运行 SQLite + Python 足够 |
| 系统盘 | **50GB SSD** | 够用 |
| 带宽 | **5Mbps** | 够用，后续可升配 |
| 操作系统 | **Ubuntu 22.04 LTS** | 推荐，教程以此为准 |

### 购买步骤

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com)
2. 顶部搜索 → **云服务器** → **立即购买**
3. 按上表选择配置
4. 设置登录密码（**记下来！**）
5. 提交订单 → 完成支付
6. 等待约 1-3 分钟，服务器创建完成

### 获取服务器信息

购买完成后，进入 **云服务器控制台** → **实例列表**，你会看到：

```
实例名称: vos-server
公网 IP: 1.2.3.4          ← 记住这个 IP
内网 IP: 10.0.0.1
操作系统: Ubuntu 22.04 LTS
```

> ⚠️ **这一步先记下公网 IP，后面配置 DNS 要用。**

---

## 3. 配置安全组（开放端口）

腾讯云默认只开 **22 端口**（SSH），需要手动打开 **80（HTTP）** 和 **443（HTTPS）**。

### 操作步骤

1. 腾讯云控制台 → **云服务器** → 左侧 **安全组**
2. 点击 **新建安全组** →
   - 名称: `vos-web`
   - 模板: **放通 22, 80, 443 端口**
3. 点击 **确定**
4. 返回实例列表 → 勾选你的服务器 → 更多操作 → **配置安全组**
5. 选择刚创建的 `vos-web` → 确认

### 验证

安全组规则应包含：

| 方向 | 协议 | 端口 | 来源 | 说明 |
|------|------|------|------|------|
| 入方向 | TCP | 22 | 0.0.0.0/0 | SSH 登录 |
| 入方向 | TCP | 80 | 0.0.0.0/0 | HTTP |
| 入方向 | TCP | 443 | 0.0.0.0/0 | HTTPS |

---

## 4. 配置 DNS（域名解析）

将 `vocosai.com` 指向腾讯云服务器的公网 IP。

### 操作步骤

1. 登录 [腾讯云 DNS 解析 DNSPod](https://console.cloud.tencent.com/cns)
2. 点击 **添加域名** → 输入 `vocosai.com` → 确定
3. 系统会提示你到域名注册商处修改 DNS 服务器：
   ```
   请到域名注册商处将 DNS 修改为：
   f1g1ns1.dnspod.net
   f1g1ns2.dnspod.net
   ```
   > 如果你是腾讯云注册的域名，这一步会自动完成，跳过即可。
4. 点击 **添加记录**，添加两条 **A 记录**：

| 记录类型 | 主机记录 | 记录值 | TTL |
|----------|---------|--------|-----|
| A | `@` | `你的服务器公网 IP` | 600 |
| A | `www` | `你的服务器公网 IP` | 600 |

5. 点击 **保存**

### DNS 生效检查

配置后等待 **5-30 分钟**，用以下命令检查是否生效：

```bash
# 在本地电脑的命令行/终端运行（Windows 用户用 PowerShell）
ping vocosai.com
nslookup vocosai.com
```

预期结果：
```
Ping vocosai.com [1.2.3.4] ...   ← 显示你的服务器 IP
```

> ✅ 如果你看到解析到了你的服务器 IP，说明 DNS 配置成功。

---

## 5. 服务器部署 VOS（一键脚本）

### 5.1 登录服务器

打开本地终端（PowerShell 或 CMD），运行：

```powershell
ssh root@你的服务器IP
```

示例：
```powershell
ssh root@1.2.3.4
```

> 输入你在购买服务器时设置的密码（输入时不会显示字符，正常）。

预期结果：
```
Welcome to Ubuntu 22.04 LTS ...
root@vos-server:~#
```

> ✅ 看到 `root@...:~#` 说明已成功登录服务器。

### 5.2 更新系统

登录后在服务器上执行：

```bash
apt-get update -y && apt-get upgrade -y
```

预期结果：一屏输出，最后回到 `root@...:~#`

### 5.3 一键部署 VOS

```bash
# 下载部署脚本并执行
curl -O https://raw.githubusercontent.com/Mikesure000/vocosai.com/main/fullstack/deploy/deploy-vocos.sh
chmod +x deploy-vocos.sh
sudo bash deploy-vocos.sh
```

脚本会自动：
1. ✅ 安装 Nginx、Python3、Certbot
2. ✅ 克隆 VOS 代码到 `/opt/vocosai`
3. ✅ 创建 `.env` 配置文件
4. ✅ 配置 Nginx 反向代理
5. ✅ 配置 systemd 服务（自动开机启动）
6. ✅ 申请 Let's Encrypt SSL 证书

**⚠️ 脚本执行过程中：**
- 会提示你按 Enter 继续 SSL 证书申请
- 请确保**第4步 DNS 解析已生效**，否则 SSL 申请会失败
- SSL 申请失败不影响其他步骤，可稍后手动运行 `sudo certbot --nginx -d vocosai.com -d www.vocosai.com`

### 5.4 验证服务是否运行

部署完成后，运行：

```bash
# 检查 VOS 应用
sudo systemctl status vocos

# 检查 Nginx
sudo systemctl status nginx
```

预期结果：
```
● vocos.service - Voice of Consumer OS
     Loaded: loaded (/etc/systemd/system/vocos.service; enabled; ...)
     Active: active (running) since ...
```

> ✅ 看到 `active (running)` 说明部署成功！

---

## 6. 配置 AI API Key

这是让 AI 分析功能工作的关键步骤。

```bash
# 编辑环境配置文件
sudo nano /opt/vocosai/.env
```

找到这一行：
```
VOC_AI_API_KEY=your_deepseek_api_key_here
```

改为你的真实 API Key（以 DeepSeek 为例）：
```
VOC_AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**保存并退出**（nano 编辑器：`Ctrl+X` → `Y` → `Enter`）

然后重启服务使配置生效：
```bash
sudo systemctl restart vocos
```

### 获取 API Key

| 提供商 | 获取地址 | 说明 |
|--------|---------|------|
| DeepSeek | https://platform.deepseek.com/api_keys | 推荐，性价比高 |
| OpenAI | https://platform.openai.com/api-keys | 稳定但贵 |
| 通义千问 | https://dashscope.aliyun.com/ | 国内可选 |

---

## 7. 验证 & 测试

### 7.1 访问网站

打开浏览器，访问：

```
https://vocosai.com
https://www.vocosai.com
```

预期结果：
- 🔒 HTTPS 安全锁（绿色小锁）
- VOS 首页正常显示
- 页面样式完整

### 7.2 测试 API

```bash
# 在本地浏览器或服务器上测试
curl https://vocosai.com/api/health
```

预期结果：
```json
{"ok": true, "version": "1.0.0", "db": "connected"}
```

### 7.3 测试 AI 分析

1. 在 VOS 页面上传示例评论数据（`sample_comments.csv`）
2. 点击 AI 分析按钮
3. 等待 AI 返回分析结果

---

## 8. 日常运维

### 8.1 常用命令

```bash
# 查看 VOS 运行状态
sudo systemctl status vocos

# 查看实时日志
sudo journalctl -u vocos -f

# 重启 VOS 服务（更新配置后）
sudo systemctl restart vocos

# 停止 VOS 服务
sudo systemctl stop vocos

# 查看 Nginx 状态
sudo systemctl status nginx

# 重启 Nginx
sudo systemctl restart nginx
```

### 8.2 更新代码

当 GitHub 仓库有更新时，在服务器上运行：

```bash
cd /opt/vocosai
git pull
sudo systemctl restart vocos
```

### 8.3 HTTPS 证书自动续期

Let's Encrypt 证书 90 天有效。Certbot 已配置自动续期：

```bash
# 手动测试续期
sudo certbot renew --dry-run

# 查看自动续期定时任务
systemctl list-timers | grep certbot
```

### 8.4 备份数据库

```bash
# 备份 SQLite 数据库
cp /opt/vocosai/data/vocos.db /opt/vocosai/data/vocos.db.$(date +%Y%m%d)

# 查看数据库大小
ls -lh /opt/vocosai/data/
```

建议设置每天自动备份（可选）：
```bash
# 添加定时任务
crontab -e

# 添加以下行（每天凌晨 3 点备份）
0 3 * * * cp /opt/vocosai/data/vocos.db /opt/vocosai/data/backups/vocos.db.$(date +\%Y\%m\%d)
```

---

## 9. 常见问题

### Q: 网站打不开，显示 "This site can't be reached"
- DNS 解析还没生效（通常 5-30 分钟）
- 安全组没开放 80/443 端口 → 回 [第3步](#3-配置安全组开放端口)

### Q: 访问显示 "502 Bad Gateway"
- VOS 服务没有运行 → 运行 `sudo systemctl restart vocos`

### Q: SSL 证书申请失败
- DNS 还没生效 → 等待后再试
- 端口 80 没开放 → 检查安全组

### Q: AI 分析没反应
- 没配置 API Key → 见 [第6步](#6-配置-ai-api-key)
- 配置后没重启服务 → `sudo systemctl restart vocos`

---

## 部署完成后的文件清单

部署完成后，服务器上的文件结构如下：

```
/opt/vocosai/
├── app.py              # Python 后端（主程序）
├── .env                # 环境配置（含 API Key）
├── deploy/
│   ├── nginx-vocos.conf    # Nginx 配置
│   ├── vocos.service       # systemd 服务
│   └── deploy-vocos.sh     # 部署脚本
├── public/
│   ├── index.html      # 前端页面
│   ├── styles.css      # 样式
│   └── app.js          # 前端逻辑
├── scripts/            # 辅助脚本
└── data/
    └── vocos.db        # SQLite 数据库（运行时创建）
```

---

> **需要帮助？** 随时告诉我你卡在哪一步，或者哪条命令执行结果不对。

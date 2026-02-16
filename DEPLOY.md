# 在 Debian 12 上部署多人俄罗斯方块

本指南将带您完成在 Debian 12 服务器上部署多人俄罗斯方块游戏的过程。
我们将使用 **Node.js** 作为后端，**Vite** 用于前端构建，**PM2** 进行进程管理，以及 **Nginx** 作为反向代理。

## 前置条件

- 一台运行 **Debian 12** 的服务器。
- Root 或 sudo 权限。
- 基本的命令行知识。

## 1. 系统设置

更新系统软件包：

```bash
sudo apt update && sudo apt upgrade -y
```

安装必要的工具：

```bash
sudo apt install -y curl git unzip build-essential
```

## 2. 安装 Node.js (v20 或更高版本)

我们将使用 NodeSource 安装较新版本的 Node.js。

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

验证安装：

```bash
node -v
npm -v
```

## 3. 项目设置

将您的项目代码上传到服务器（例如，上传到 `/opt/tetris`）。

```bash
# 示例：创建目录
sudo mkdir -p /opt/tetris
# (在此处上传您的文件)
cd /opt/tetris
```

### 后端设置

进入 `tetris-shared` 目录并安装依赖：

```bash
cd tetris-shared
npm install
```

### 前端设置

进入 `tetris-vue` 目录并安装依赖：

```bash
cd ../tetris-vue
npm install
```

构建生产环境前端代码：

```bash
npm run build
```

这将在 `tetris-vue/dist` 中创建一个 `dist` 目录。

## 4. 使用 PM2 进行进程管理

全局安装 PM2 以保持后端持续运行：

```bash
sudo npm install -g pm2
```

启动后端服务器：

```bash
cd ../tetris-shared
# 启动 server.js (后端入口点)
pm2 start server.js --name "tetris-backend"
```

保存进程列表并配置 PM2 开机自启：

```bash
pm2 save
pm2 startup
# 按照命令输出的提示运行生成的命令以启用启动钩子
```

## 5. Nginx 配置

安装 Nginx：

```bash
sudo apt install -y nginx
```

创建一个新的 Nginx 配置文件：

```bash
sudo nano /etc/nginx/sites-available/tetris
```

粘贴以下配置（将 `your_domain_or_ip` 替换为您的实际域名或服务器 IP）：

```nginx
server {
    listen 80;
    server_name your_domain_or_ip;

    # 前端 (提供静态文件)
    location / {
        root /opt/tetris/tetris-vue/dist;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    # 后端 (Socket.io & API)
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用站点并重启 Nginx：

```bash
sudo ln -s /etc/nginx/sites-available/tetris /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 6. 防火墙 (可选但推荐)

如果您启用了 `ufw`，允许 Nginx 通行：

```bash
sudo ufw allow 'Nginx Full'
```

## 7. 验证

在浏览器中访问 `http://your_domain_or_ip`。游戏应该可以加载，并且您应该能够创建房间并进行游戏。

---

## 故障排除

- **后端日志**: `pm2 logs tetris-backend`
- **Nginx 日志**: `sudo tail -f /var/log/nginx/error.log`
- **权限**: 确保运行 Nginx 的用户（通常是 `www-data` 或 `root`，取决于设置）可以读取 `/opt/tetris` 中的文件。

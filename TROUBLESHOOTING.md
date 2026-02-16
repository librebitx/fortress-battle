# 故障排除指南

如果网站遇到问题，您可以查看日志来诊断问题。日志的位置取决于您运行游戏的方式。

## 1. 本地运行 (通过 `start_game.sh`)

如果您使用 `./start_game.sh` 脚本启动游戏，日志将被重定向到项目目录中的文件。

- **后端日志**: `tetris-shared/server.log`
- **前端日志**: `tetris-vue/vue.log`

### 如何查看日志：

您可以使用 `tail` 命令实时查看日志：

```bash
# 查看后端日志
tail -f tetris-shared/server.log

# 查看前端日志
tail -f tetris-vue/vue.log
```

## 2. 生产环境运行 (通过 PM2)

如果您使用 `pm2` 部署游戏（如 `DEPLOY.md` 中所述），日志由 PM2 管理。

- **查看所有日志**:
  ```bash
  pm2 logs
  ```

- **查看特定后端日志**:
  ```bash
  pm2 logs tetris-backend
  ```

- **查看 Nginx 访问/错误日志** (如果使用了 Nginx):
  ```bash
  sudo tail -f /var/log/nginx/access.log
  sudo tail -f /var/log/nginx/error.log
  ```

## 3. 常见问题

### 端口已被占用 (Port already in use)
如果您看到类似 `EADDRINUSE` 的错误，意味着端口 (3000 或 5173) 已经被占用。
- **解决方法**: 运行 `./stop_game.sh` 清除旧进程，或使用 `fuser -k 3000/tcp` 杀死特定进程。

### 前端无法连接到后端
如果游戏加载了但无法加入房间：
- 检查 **后端日志** 查看服务器是否收到了连接。
- 检查 **浏览器控制台** (F12 -> Console) 查看连接错误 (例如 `WebSocket connection failed`)。

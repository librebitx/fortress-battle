# 俄罗斯方块 (Tetris)
一个允许两名玩家通过网络对战的俄罗斯方块游戏。

## 文档
- [部署指南](DEPLOY.md)
- [故障排除与日志](TROUBLESHOOTING.md)

## 项目结构

以下是项目的主要文件和目录结构说明：

```
.
├── DEPLOY.md               # 部署指南（中文）
├── LICENSE                 # 许可证文件
├── README.md               # 项目自述文件（中文）
├── TROUBLESHOOTING.md      # 故障排除与日志指南（中文）
├── push.sh                 # 推送代码脚本
├── start_game.sh           # 启动游戏脚本（同时启动前后端）
├── stop_game.sh            # 停止游戏脚本
├── tetris-shared/          # 后端服务代码目录
│   ├── server.js           # 后端服务器入口文件 (Node.js/Socket.io)
│   ├── package.json        # 后端依赖配置
│   └── ...
└── tetris-vue/             # 前端应用代码目录 (Vue 3/Vite)
    ├── index.html          # 前端入口 HTML
    ├── package.json        # 前端依赖配置
    ├── vite.config.js      # Vite 构建配置
    ├── src/                # 前端源代码
    │   ├── App.vue         # 根组件
    │   ├── main.js         # 前端入口 JS
    │   ├── components/     # Vue 组件 (Game.vue, Lobby.vue)
    │   └── composables/    # 组合式函数 (useSocket.js)
    └── ...
```

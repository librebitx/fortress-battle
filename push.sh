#!/bin/bash

# ==========================================
# Universal Git Helper
# ==========================================

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 获取当前分支名
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
if [ -z "$CURRENT_BRANCH" ]; then
    echo -e "${RED}Error: Not a git repository.${NC}"
    exit 1
fi

echo -e "${YELLOW}>>> Deploying to branch: ${GREEN}${CURRENT_BRANCH}${NC}"

# 暂存所有更改
echo "Staging changes..."
git add .

# 获取提交信息
MSG="$1"
if [ -z "$MSG" ]; then
    # 如果没有参数，默认使用时间戳
    MSG="update: $(date +'%Y-%m-%d %H:%M:%S')"
fi

# 提交更改
echo "Committing..."
git commit -m "$MSG"

# 拉取远程代码 (Rebase 模式)
# 防止多人协作或多端同步时的冲突
echo "Pulling remote changes..."
git pull --rebase origin "$CURRENT_BRANCH"

if [ $? -ne 0 ]; then
    echo -e "${RED}Conflict detected! Please fix conflicts manually.${NC}"
    exit 1
fi

# 推送到远程
echo "Pushing to remote..."
git push origin "$CURRENT_BRANCH"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}>>> Success! Code pushed to [${CURRENT_BRANCH}]. 🚀${NC}"
else
    echo -e "${RED}>>> Push failed.${NC}"
fi

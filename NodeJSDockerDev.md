nodejs环境安装（docker）
docker pull node:22-alpine

nodejs环境安装（podman）
podman pull node:22-alpine

# 初始化
Linux
rm -rf node_modules package-lock.json
Windows
Remove-Item "package-lock.json"
Remove-Item "node_modules" -Recurse

# 使用当前代码进入一次性开发环境
进入开发环境（docker）
docker run -it --rm --network host -v .:/opt/mcp --entrypoint sh node:22-alpine -c "cd /opt/mcp && npm install && sh"
进入开发环境（podman）
podman run -it --rm --network host -v .:/opt/mcp --entrypoint sh node:22-alpine -c "cd /opt/mcp && npm install && sh"

# 构建镜像
docker build -t zhoutijie/milomcp:latest .
podman build -t zhoutijie/milomcp:latest .
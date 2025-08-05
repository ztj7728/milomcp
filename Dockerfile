# 使用 node:22-alpine 作为基础镜像
FROM node:22-alpine

# 设置工作目录
WORKDIR /opt/mcp

# 将 package.json 和 package-lock.json 复制到工作目录
COPY package*.json ./

# 安装依赖
RUN npm install

# 将当前目录下的所有文件复制到工作目录
COPY . .

# 开放容器的 3000 3001 端口
EXPOSE 3000 3001

# 启动应用
CMD ["npm", "start"]
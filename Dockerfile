# 使用 node:22-alpine 作为基础镜像
FROM node:22-alpine

# 声明一个构建参数来接收端口号
ARG PORT=3000

# 设置工作目录
WORKDIR /opt/mcp

# 将 package.json 复制到工作目录
COPY package.json ./

# 安装依赖
RUN npm install

# 将当前目录下的所有文件复制到工作目录
COPY . .

# 使用构建参数来动态开放端口
EXPOSE ${PORT}

# 启动应用
CMD ["npm", "start"]

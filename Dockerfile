# 使用 node:22-alpine 作为基础镜像
FROM node:22-alpine

# 声明一个构建参数来接收端口号
ARG PORT=3000

# 设置工作目录
WORKDIR /opt/mcp

# 将 package.json 和 package-lock.json (如果存在) 复制到工作目录
COPY package*.json ./

# 安装编译原生模块所需的依赖，运行 npm install，然后删除这些依赖
# 新增了 py3-setuptools 来解决 python 3.12 中缺少 distutils 的问题
RUN apk add --no-cache --virtual .build-deps python3 py3-setuptools make g++ && \
    npm install && \
    apk del .build-deps

# 将当前目录下的所有文件复制到工作目录
COPY . .

# 使用构建参数来动态开放端口
EXPOSE ${PORT}

# 启动应用
CMD ["npm", "start"]
docker run -it --rm --network host -v .:/opt/mcp --entrypoint sh node:22-alpine -c "cd /opt/mcp && npm install && sh"
or
podman run -it --rm --network host -v .:/opt/mcp --entrypoint sh node:22-alpine -c "cd /opt/mcp && npm install && sh"
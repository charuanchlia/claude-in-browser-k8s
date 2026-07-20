FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/pod-server ./apps/pod-server
RUN npm ci
RUN mkdir -p /workspace && chown -R node:node /app /workspace
# The Claude Agent SDK refuses --dangerously-skip-permissions as root (security
# guard in the CLI), and bypassPermissions is required since there's no human
# in the loop to approve tool calls in a pod. Run as the non-root `node` user
# that node:24-slim already provides.
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "--workspace", "@claude-in-browser-k8s/pod-server", "start"]

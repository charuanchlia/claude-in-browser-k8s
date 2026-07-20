FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway
RUN npm ci
# built client is copied in by build-and-load.sh after `vite build`
COPY apps/web-client/dist ./web-client/dist
RUN chown -R node:node /app
USER node
ENV PORT=3000 CLIENT_DIR=/app/web-client/dist
EXPOSE 3000
CMD ["npm", "--workspace", "@claude-lab/gateway", "start"]

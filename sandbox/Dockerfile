FROM node:20-alpine

# Security: Create and run as unprivileged sandboxuser
RUN addgroup -S sandboxgroup && adduser -S sandboxuser -G sandboxgroup

WORKDIR /workspace

USER sandboxuser

# Disallow outbound network in container runtime via --network none
ENTRYPOINT ["node", "runner.js"]

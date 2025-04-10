# Use an official Node.js runtime as a parent image
# Choose a version compatible with your dependencies (e.g., LTS version)
FROM node:20-alpine AS base

# Set the working directory in the container
WORKDIR /usr/src/app

# Prevent Docker from caching node_modules based on package-lock.json changes alone
# Copy package.json and package-lock.json (or yarn.lock or pnpm-lock.yaml)
COPY package*.json ./

# --- Dependencies ---
FROM base AS dependencies
# Install app dependencies using the appropriate package manager
# Use --frozen-lockfile (or equivalent) for reproducible installs
RUN npm install --frozen-lockfile --omit=dev
# If you have native dependencies, you might need build tools:
# RUN apk add --no-cache make gcc g++ python3

# --- Build ---
# Copy the rest of the application source code
FROM base AS build
WORKDIR /usr/src/app
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY . .
# Install dev dependencies needed for build
RUN npm install --omit=optional
# Build the TypeScript code
RUN npm run build

# --- Release ---
# Use a minimal Node.js image for the final stage
FROM node:20-alpine AS release
WORKDIR /usr/src/app

# Set environment variables (optional, can be set at runtime)
ENV NODE_ENV=production
# ENV NADOCAST_BASE_URL=... (Set these at runtime or via orchestration)
# ENV BLUESKY_SERVICE=...
# ENV BLUESKY_IDENTIFIER=...
# ENV BLUESKY_PASSWORD=...
# ENV POLL_INTERVAL_MINUTES=15
# ENV STATE_FILE_PATH=/usr/src/app/state/last_processed_run.txt
# ENV LOG_LEVEL=info

# Copy built artifacts and necessary dependencies from previous stages
COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json .

# Create the state directory and set permissions if needed
# The state file itself should ideally be mounted as a volume
RUN mkdir -p state && chown node:node state

# Switch to a non-root user for security
USER node

# Expose any ports the app might listen on (not strictly needed for this monitor)
# EXPOSE 3000

# Define the command to run the application
CMD ["node", "dist/main.js"]
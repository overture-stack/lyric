# Global variables
ARG COMMIT=""
ARG APP_USER=lyric
ARG WORKDIR=/usr/src/app

######################
# Configure base image
######################
FROM node:18.16.1-alpine AS base

ARG APP_USER
ARG WORKDIR

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

# install pnpm as root user, before updating node ownership
RUN npm i -g pnpm

# create our own user to run node, don't run node in production as root
ENV APP_UID=9999
ENV APP_GID=9999
RUN addgroup -S -g $APP_GID $APP_USER \
	&& adduser -S -u $APP_UID -g $APP_GID $APP_USER \
	&& mkdir -p ${WORKDIR} && mkdir -p /usr/pruned

WORKDIR ${WORKDIR}

RUN chown -R ${APP_USER}:${APP_USER} ${WORKDIR}
RUN chown -R ${APP_USER}:${APP_USER} /usr/pruned

USER ${APP_USER}:${APP_USER}

######################
# Configure workspace image
######################

FROM base as workspace

ARG APP_USER
ARG WORKDIR

USER ${APP_USER}:${APP_USER}

COPY . ./


######################
# Configure pruned image
######################

FROM workspace AS pruned

ARG APP_USER
ARG WORKDIR

WORKDIR ${WORKDIR}

USER ${APP_USER}:${APP_USER}

# Deploy a package from a workspace. All dependencies of the deployed package are installed inside an isolated node_modules
RUN pnpm --filter server --prod deploy ${WORKDIR}/pruned


######################
# Configure server image
######################
FROM base AS server

ARG APP_USER
ARG WORKDIR
ARG APPS_SERVER_DIR=${WORKDIR}/apps/server

USER ${APP_USER}

WORKDIR ${WORKDIR}

COPY --from=pruned ${WORKDIR}/pruned/dist ./dist
COPY --from=pruned ${WORKDIR}/pruned/node_modules ./node_modules

EXPOSE 3000

ENV COMMIT_SHA=${COMMIT}
ENV NODE_ENV=production

CMD [ "node", "./dist/src/server.js"]
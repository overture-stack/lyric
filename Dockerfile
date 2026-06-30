# Global variables
ARG COMMIT=""
ARG APP_USER=lyric
ARG WORKDIR=/usr/src/app

######################
# Configure base image
######################
FROM node:22-alpine AS base

ARG APP_USER
ARG WORKDIR

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

# create our own user to run node, don't run node in production as root
ENV APP_UID=9999
ENV APP_GID=9999
RUN addgroup -S -g $APP_GID $APP_USER \
	&& adduser -S -u $APP_UID -g $APP_GID $APP_USER \
	&& mkdir -p ${WORKDIR}

ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable
RUN corepack prepare pnpm@11.1.1 --activate

WORKDIR ${WORKDIR}

RUN chown -R ${APP_USER}:${APP_USER} ${WORKDIR}

USER ${APP_USER}:${APP_USER}

######################
# Configure build image
######################

FROM base AS build

ARG APP_USER
ARG WORKDIR

COPY --chown=${APP_USER}:${APP_USER} . ./
USER ${APP_USER}:${APP_USER}

RUN pnpm install --ignore-scripts --frozen-lockfile

RUN pnpm build:all


######################
# Configure prod-deps image
######################

FROM build AS prod-deps

ARG APP_USER
ARG WORKDIR

WORKDIR ${WORKDIR}

USER ${APP_USER}:${APP_USER}

ENV CI=true

# pnpm will not install any package listed in devDependencies
RUN pnpm install --prod --no-scripts --frozen-lockfile


######################
# Configure server image
######################
FROM base AS server

ARG APP_USER
ARG WORKDIR

USER ${APP_USER}:${APP_USER}

WORKDIR ${WORKDIR}

COPY --from=prod-deps --chown=${APP_USER}:${APP_USER} ${WORKDIR} .
COPY --from=build --chown=${APP_USER}:${APP_USER} ${WORKDIR}/apps/server/dist apps/server/dist

EXPOSE 3000

ENV COMMIT_SHA=${COMMIT}
ENV NODE_ENV=production

CMD [ "pnpm", "start:prod" ]

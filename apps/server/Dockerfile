FROM node:18.16.1-alpine

ARG COMMIT=""

# create our own user to run node, don't run node in production as root
ENV APP_USER=lyric
ENV APP_UID=9999
ENV APP_GID=9999
RUN addgroup -S -g $APP_GID $APP_USER \
	&& adduser -S -u $APP_UID -g $APP_GID $APP_USER \
	&& mkdir -p /usr/src/app


WORKDIR /usr/src/app
COPY . ./

RUN chown -R ${APP_USER}:${APP_USER} /usr/src/app

# install pnpm as root user, before updating node ownership
RUN npm i -g pnpm

# give our user ownership over node source directories
RUN chown -R ${APP_USER}:${APP_USER} $(npm config get prefix)

USER ${APP_USER}:${APP_USER}

RUN pnpm install --ignore-scripts
RUN pnpm build

EXPOSE 3000

ENV COMMIT_SHA=${COMMIT}
ENV NODE_ENV=production

CMD [ "pnpm", "-C", "apps/server", "--silent", "dev"]
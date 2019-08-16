FROM alpine:edge
MAINTAINER Chance Hudson

RUN apk add --no-cache nodejs-npm

COPY . /src
WORKDIR /src

RUN npm ci

CMD ["npm", "start"]

FROM node:current-alpine3.14

# workdir
WORKDIR /app

# copy
COPY package.json .
RUN npm install

EXPOSE 4480

CMD [ "npm", "run", "start.dev" ]
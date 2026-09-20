#!/bin/sh
# BUG 8: Incorrect port mapping - app listens on 5000, not 8080
# BUG 9: Fixed --name causes "Existing container name conflict" on second run
docker rm -f debug-web-app
docker build -t docker-web-debug:v1 .
docker run --name debug-web-app -p 8080:5000 docker-web-debug:v1


FROM golang:1.26-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/pulse-api ./cmd/local

FROM alpine:3.22

RUN adduser -D -H appuser
COPY --from=build /out/pulse-api /pulse-api

USER appuser
EXPOSE 8080

CMD ["/pulse-api"]
FROM golang:1.26-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN mkdir -p /out \
    && GOBIN=/out go install github.com/pressly/goose/v3/cmd/goose@v3.20.0 \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/pulse-api ./cmd/local

FROM alpine:3.22

RUN apk add --no-cache ca-certificates \
    && adduser -D -H appuser

COPY --from=build /out/pulse-api /pulse-api
COPY --from=build /out/goose /goose
COPY --from=build /src/internal/database/migrations /migrations

USER appuser
EXPOSE 8080

CMD ["/pulse-api"]
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
    && adduser -D -H appuser \
    && wget -q -O /etc/ssl/certs/aws-rds-global-bundle.pem \
        https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && test -s /etc/ssl/certs/aws-rds-global-bundle.pem \
    && chmod 0444 /etc/ssl/certs/aws-rds-global-bundle.pem

COPY --from=build /out/pulse-api /pulse-api
COPY --from=build /out/goose /goose
COPY --from=build /src/internal/database/migrations /migrations

USER appuser
ENV DB_SSLROOTCERT=/etc/ssl/certs/aws-rds-global-bundle.pem
EXPOSE 8080

CMD ["/pulse-api"]

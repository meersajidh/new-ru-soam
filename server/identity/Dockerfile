# Build context: server/identity/
# docker build -t identity .

# --- Build Stage ---
FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /app/bin/identity ./cmd

# --- Final Stage ---
# Use Alpine for ca-certificates (needed for outbound HTTPS to Google JWKS in later slices).
FROM alpine:3.20
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/bin/identity /app/identity

# Cloud Run injects PORT; default 8080 documented in .env.example.
EXPOSE 8080

ENTRYPOINT ["/app/identity"]

# Deployment Guide

## VPS Requirements
- Docker Engine + Docker Compose
- DNS entries for:
   - vault/admin/api/arcade/booking.soleonmyback.us
   - vault/admin/api/arcade/booking.negreauxtech.com
   - vault/admin/api/arcade/booking.negreauxtech.org
   - vault/admin/api/arcade/booking.negreaux.com

## Steps
1. Copy .env.example to .env and set production values.
2. Build and run:
   - docker compose --env-file .env up -d --build
3. Confirm health:
   - GET /api/v1/health
4. Configure TLS using Certbot or a cloud load balancer in front of Nginx.
5. Enable external backups for postgres_data and logs.

## Recommended Production Hardening
- Rotate JWT and Stripe secrets.
- Add WAF and fail2ban.
- Restrict DB/Redis ports to private network.
- Add observability (Prometheus/Grafana/Sentry).
- Configure object storage if media volume grows.

## Hostname Strategy
- Canonical frontend host: vault.soleonmyback.us
- Canonical API host: api.soleonmyback.us
- Apex/root domains are redirected to the canonical frontend host by Nginx.

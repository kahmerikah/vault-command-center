# API Reference (v1)

Base URL: /api/v1

## Health
- GET /health

## Gateway
- GET /gateway/status

## Auth
- POST /auth/register
- POST /auth/login
- GET /auth/me

## Dashboard
- GET /dashboard/overview

## Modules
- GET /modules

## Payments
- POST /payments/checkout/session
- POST /payments/logs
- POST /webhooks/stripe

## Notifications
- GET /notifications
- POST /notifications

## Bookings
- POST /bookings

## Blockchain
- POST /blockchain/wallet
- POST /blockchain/transactions

## Analytics
- POST /analytics/events

All responses follow:
- Success: {"status": 200, "data": {...}}
- Error: {"status": 400, "error": "message"}

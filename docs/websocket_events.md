# WebSocket Events

Socket endpoint: /socket.io

## Server -> Client
- system:hello
- notification:new
- booking:updated
- chain:transaction
- dashboard:subscribed

## Client -> Server
- dashboard:subscribe

## Event Design Guidance
- Keep payloads compact and serializable.
- Include IDs for dedupe in UI.
- Emit follow-up API fetches for authoritative state when needed.

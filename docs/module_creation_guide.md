# Module Creation Guide

## 1. Create Module Manifest
Create modules/<module_key>/module.json:

```json
{
  "key": "example",
  "name": "Example",
  "description": "Example SOMB module",
  "route_prefix": "/api/v1/example",
  "is_enabled": true,
  "permissions": ["example.read", "example.write"],
  "websocket_events": ["example:updated"]
}
```

## 2. Add Backend Surface
- Create route blueprint in backend/routes/.
- Create service in backend/services/.
- Add or reuse models in backend/models/.
- Register route in backend/routes/__init__.py.

## 3. Add Frontend Surface
- Add page/component in frontend/src/pages or frontend/src/components.
- Hook API calls through frontend/src/lib/api.js.
- Subscribe to real-time events via frontend/src/lib/socket.js.

## 4. Add Permissions
- Add permission codes and enforce with require_roles in backend/middleware/auth.py.

## 5. Add Tracking
- Track key actions using AnalyticsService.track.
- Emit operator-visible notifications using NotificationService.create.

## 6. Add Task Jobs (Optional)
- Add asynchronous jobs in backend/tasks/jobs.py when logic should run off request thread.

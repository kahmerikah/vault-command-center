# Module Creation Guide

## 1. Create Module Manifest
Create modules/<module_key>/module.json:

```json
{
  "key": "example_app",
  "name": "Example App",
  "description": "Example SOMB engine module",
  "routes": ["/example"],
  "api_prefix": "/api/v1/example",
  "route_prefix": "/api/v1/example",
  "is_enabled": true,
  "permissions": ["example.read", "example.write"],
  "events": ["example.created", "example.updated"],
  "websocket_events": ["example:updated", "engine:event"],
  "uses": ["auth", "notifications", "workflows", "realtime"],
  "workflows": [
    {
      "key": "example.lifecycle",
      "trigger": "example.created",
      "actions": [
        { "type": "log", "message": "Example workflow executed" },
        { "type": "set_state", "key": "engine.example.last_created", "value": "$payload" }
      ]
    }
  ]
}
```

## 2. Add Backend Surface
- Create route blueprint in backend/routes/.
- Create service in backend/services/.
- Add or reuse models in backend/models/.
- Register route in backend/routes/__init__.py.
- Emit engine events for lifecycle transitions.

## 3. Add Frontend Surface
- Add page/component in frontend/src/pages or frontend/src/components.
- Hook API calls through frontend/src/lib/api.js.
- Subscribe to real-time events via frontend/src/lib/socket.js.

## 4. Add Permissions
- Add permission codes and enforce with require_roles in backend/middleware/auth.py.

## 5. Add Tracking
- Track key actions using AnalyticsService.track.
- Emit operator-visible notifications using NotificationService.create.
- Verify engine events via /api/v1/engine/events.

## 6. Add Task Jobs (Optional)
- Add asynchronous jobs in backend/tasks/jobs.py when logic should run off request thread.

## 7. Validate Module Runtime
- Check module registration: /api/v1/engine/modules
- Check workflow registration: /api/v1/engine/workflows
- Validate realtime subscription via engine:subscribe and module:subscribe

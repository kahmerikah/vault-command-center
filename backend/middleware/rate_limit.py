from backend.extensions import limiter


def apply_route_rate_limits(blueprint):
    # Route-level hooks keep limits close to API concerns and easy to tune per module.
    limiter.limit("60 per minute")(blueprint)

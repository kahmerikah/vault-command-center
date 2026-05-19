def parse_limit_offset(request):
    try:
        limit = min(int(request.args.get("limit", 20)), 100)
        offset = max(int(request.args.get("offset", 0)), 0)
    except ValueError:
        limit, offset = 20, 0
    return limit, offset


def paginate(query, page: int = 1, limit: int = 20) -> dict:
    """Paginate a SQLAlchemy query and return consistent metadata.

    Returns both top-level pagination fields and a nested `pagination` object
    for compatibility with existing and newer route handlers.
    """
    page = max(int(page or 1), 1)
    limit = max(min(int(limit or 20), 100), 1)

    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    pages = (total + limit - 1) // limit if total else 0

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "has_next": page < pages,
        "has_prev": page > 1,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": pages,
            "has_next": page < pages,
            "has_prev": page > 1,
        },
    }

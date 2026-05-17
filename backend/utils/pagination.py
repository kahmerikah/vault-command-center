def parse_limit_offset(request):
    try:
        limit = min(int(request.args.get("limit", 20)), 100)
        offset = max(int(request.args.get("offset", 0)), 0)
    except ValueError:
        limit, offset = 20, 0
    return limit, offset

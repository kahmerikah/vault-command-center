from flask import jsonify


def success_response(data=None, status=200):
    return jsonify({"status": status, "data": data or {}}), status


def error_response(message: str, status=400):
    return jsonify({"status": status, "error": message}), status

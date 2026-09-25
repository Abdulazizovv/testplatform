from rest_framework.exceptions import APIException


class BusinessError(APIException):
    """
    A business-rule violation with a user-facing (Uzbek) message. Raised by services, and
    rendered by DRF directly as `{"detail": message, "errors": [...]}` (HTTP 400 by default).
    """

    status_code = 400

    def __init__(self, message, errors=None, status_code=None):
        body = {"detail": message}
        if errors:
            body["errors"] = errors
        super().__init__(detail=body)
        self.detail = body  # keep raw JSON types (ints stay ints); APIException would stringify
        self.message = message
        if status_code:
            self.status_code = status_code

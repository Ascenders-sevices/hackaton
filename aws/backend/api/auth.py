import os
import jwt
import requests
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

# Local dev tenant — matches seed_local.sql
_LOCAL_TENANT_ID = "00000000-0000-0000-0000-000000000001"

_jwks_cache = None


def _get_jwks():
    global _jwks_cache
    if _jwks_cache is None:
        url = (
            f"https://cognito-idp.{settings.COGNITO_REGION}.amazonaws.com"
            f"/{settings.COGNITO_USER_POOL_ID}/.well-known/jwks.json"
        )
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        _jwks_cache = resp.json()
    return _jwks_cache


class CognitoUser:
    def __init__(self, sub, tenant_id, email):
        self.sub = sub
        self.tenant_id = tenant_id
        self.email = email
        self.is_authenticated = True


class CognitoAuthentication(BaseAuthentication):
    def authenticate(self, request):
        # ── Local dev bypass ────────────────────────────────────
        if getattr(settings, "LOCAL_DEV", False):
            return (
                CognitoUser(
                    sub="local-dev-user",
                    tenant_id=_LOCAL_TENANT_ID,
                    email="dev@airbee.local",
                ),
                None,
            )
        # ────────────────────────────────────────────────────────

        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return None

        token = auth_header[7:]
        try:
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header["kid"]

            jwks = _get_jwks()
            key_data = next((k for k in jwks["keys"] if k["kid"] == kid), None)
            if not key_data:
                raise AuthenticationFailed("Token key not found in JWKS")

            public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )

            tenant_id = payload.get("custom:tenant_id", "")
            if not tenant_id:
                raise AuthenticationFailed("custom:tenant_id claim missing — signup not completed")

            return (
                CognitoUser(
                    sub=payload["sub"],
                    tenant_id=tenant_id,
                    email=payload.get("email", ""),
                ),
                token,
            )
        except AuthenticationFailed:
            raise
        except Exception as exc:
            raise AuthenticationFailed(f"Invalid token: {exc}")

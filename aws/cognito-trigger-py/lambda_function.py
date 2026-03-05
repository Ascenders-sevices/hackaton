"""
Cognito PostConfirmation trigger — Python version.
Fires after a user confirms their email.
Creates: tenant → profile → default room categories → user role.
Sets custom:tenant_id attribute on the Cognito user.
"""

import os
import json
import uuid
import boto3
import psycopg2

DB_CONFIG = {
    "host": os.environ["DB_HOST"],
    "port": int(os.environ.get("DB_PORT", 5432)),
    "dbname": os.environ.get("DB_NAME", "airbee"),
    "user": os.environ["DB_USER"],
    "password": os.environ["DB_PASSWORD"],
    "sslmode": "require",
    "connect_timeout": 10,
}

COGNITO_CLIENT = boto3.client("cognito-idp", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def handler(event, context):
    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event

    raw_attrs = event.get("request", {}).get("userAttributes", {})
    if isinstance(raw_attrs, dict):
        user_attrs = raw_attrs
    else:
        user_attrs = {
            a.get("Name"): a.get("Value")
            for a in raw_attrs
            if isinstance(a, dict) and a.get("Name")
        }
    sub = user_attrs["sub"]
    email = user_attrs.get("email", "")
    name = user_attrs.get("name", email.split("@")[0])

    tenant_id = str(uuid.uuid4())
    profile_id = sub

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            # Create tenant
            cur.execute(
                """
                INSERT INTO tenants (id, name, slug, contact_email)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                [tenant_id, f"{name}'s Property", _slugify(name), email],
            )

            # Create profile
            cur.execute(
                """
                INSERT INTO profiles (id, tenant_id, full_name)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                [profile_id, tenant_id, name],
            )

            # Default room categories
            default_categories = [
                "Standard Room",
                "Deluxe Room",
                "Suite",
            ]
            for idx, cat_name in enumerate(default_categories):
                cat_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO room_categories (id, tenant_id, name, display_order)
                    VALUES (%s, %s, %s, %s)
                    """,
                    [cat_id, tenant_id, cat_name, idx],
                )

        conn.commit()

        # Set custom:tenant_id on the Cognito user
        COGNITO_CLIENT.admin_update_user_attributes(
            UserPoolId=event["userPoolId"],
            Username=event["userName"],
            UserAttributes=[{"Name": "custom:tenant_id", "Value": tenant_id}],
        )

        print(json.dumps({"event": "tenant_created", "tenant_id": tenant_id, "sub": sub}))
    except Exception as exc:
        conn.rollback()
        print(f"ERROR in cognito trigger: {exc}")
        raise
    finally:
        conn.close()

    return event


def _slugify(text: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")

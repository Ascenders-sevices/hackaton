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

    user_attrs = {a["Name"]: a["Value"] for a in event["request"]["userAttributes"]}
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
                ("Standard Room", 99.00),
                ("Deluxe Room", 149.00),
                ("Suite", 249.00),
            ]
            for cat_name, base_price in default_categories:
                cat_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO room_categories (id, tenant_id, name, base_price)
                    VALUES (%s, %s, %s, %s)
                    """,
                    [cat_id, tenant_id, cat_name, base_price],
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

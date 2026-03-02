/**
 * Cognito PostConfirmation Lambda Trigger
 * Fires after a user confirms their email. Creates tenant + profile in RDS.
 *
 * Attach this to: Cognito User Pool → Triggers → Post confirmation
 * Env vars needed: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, COGNITO_USER_POOL_ID
 */

import pkg from "pg";
const { Pool } = pkg;
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "us-east-1",
});

export const handler = async (event) => {
  const { userPoolId, userName, request } = event;
  const userAttributes = request.userAttributes;

  const cognitoSub = userAttributes.sub;
  const email = userAttributes.email;
  const fullName =
    userAttributes.name ||
    userAttributes["custom:full_name"] ||
    email.split("@")[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Generate tenant slug
    const slugBase = fullName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const slugSuffix = cognitoSub.substring(0, 8);
    const slug = `${slugBase}-${slugSuffix}`;

    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, currency, timezone)
       VALUES ($1, $2, 'INR', 'Asia/Kolkata')
       RETURNING id`,
      [`${fullName}'s Property`, slug]
    );
    const tenantId = tenantResult.rows[0].id;

    // Create profile
    await client.query(
      `INSERT INTO profiles (id, tenant_id, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET tenant_id = $2, full_name = $3`,
      [cognitoSub, tenantId, fullName]
    );

    // Create user role
    await client.query(
      `INSERT INTO user_roles (user_id, tenant_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT DO NOTHING`,
      [cognitoSub, tenantId]
    );

    // Create default room categories
    await client.query(
      `INSERT INTO room_categories (tenant_id, name, color, display_order) VALUES
        ($1, 'Standard', '#6B7280', 1),
        ($1, 'Deluxe',   '#3B82F6', 2),
        ($1, 'Suite',    '#8B5CF6', 3),
        ($1, 'Villa',    '#10B981', 4)`,
      [tenantId]
    );

    // Create default CMS pages
    await client.query(
      `INSERT INTO pages (tenant_id, slug, title, content_blocks, is_published) VALUES
        ($1, 'home',  'Home',     '[{"type":"hero","data":{"title":"Welcome","subtitle":"Experience comfort"}}]', true),
        ($1, 'about', 'About Us', '[{"type":"text","data":{"content":"Tell your story here."}}]', false)`,
      [tenantId]
    );

    await client.query("COMMIT");

    // Store tenant_id in Cognito custom attribute
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: userName,
        UserAttributes: [
          { Name: "custom:tenant_id", Value: tenantId },
        ],
      })
    );

    console.log(`Provisioned tenant ${tenantId} for user ${cognitoSub}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error provisioning tenant:", err);
    throw err;
  } finally {
    client.release();
  }

  return event;
};

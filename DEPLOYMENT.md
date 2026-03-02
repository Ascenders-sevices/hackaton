# AIR BEE — AWS Deployment Guide

## Architecture
```
[Amplify] → [Cognito] + [API Gateway HTTP API] → [Lambda: airbee-backend (Django DRF)] → [RDS] + [Bedrock]
                                               ↑
                              [Lambda: airbee-cognito-trigger (Python)]
```
**Region:** us-east-1 (required for Bedrock Claude access)

---

## Step 1 — Create RDS PostgreSQL

1. RDS Console → Create database
2. Engine: PostgreSQL 15 | Instance: db.t3.micro
3. DB name: `airbee`, Username: `airbee`, generate password
4. **Publicly accessible: YES** (for hackathon)
5. Security Group: allow port 5432 from 0.0.0.0/0 (restrict after demo)
6. Save: endpoint, port, username, password

**Run schema:**
```bash
psql -h <RDS_ENDPOINT> -U airbee -d airbee -f aws/database/schema.sql
```

---

## Step 2 — Create Cognito User Pool

1. Cognito Console → Create User Pool
2. Sign-in: Email | Self-registration: ON | Email verification: ON
3. Required attributes: `email`, `name`
4. Custom attributes: `custom:tenant_id` (String, mutable)
5. Create App Client: Type = Public, no secret
6. Note: **User Pool ID** + **App Client ID**

---

## Step 3 — Create IAM Role for Lambda

1. IAM Console → Roles → Create Role → Lambda
2. Attach policies:
   - `AWSLambdaBasicExecutionRole`
   - `AmazonBedrockFullAccess`
   - `AmazonCognitoPowerUser` (for cognito-trigger to update user attributes)
3. Name: `airbee-lambda-role`

---

## Step 4 — Enable Bedrock Model Access

1. Bedrock Console (us-east-1) → Model access
2. Request access to: **Claude 3.5 Haiku** (`anthropic.claude-3-5-haiku-20241022-v1:0`)
3. Wait for approval (usually instant for Haiku)

---

## Step 5 — Deploy Lambda Functions (2 total)

### 5a — airbee-backend (Django DRF — handles ALL API + AI routes)

```bash
cd aws/backend
pip install -r requirements.txt -t package/
cp -r airbee api lambda_handler.py package/
cd package && zip -r ../function.zip . && cd ..
```

In Lambda Console:
- Runtime: **Python 3.12**
- Handler: `lambda_handler.handler`
- Role: `airbee-lambda-role`
- Timeout: **60s**
- Memory: **512MB**

**Environment variables:**
```
DB_HOST=<rds-endpoint>
DB_PORT=5432
DB_NAME=airbee
DB_USER=airbee
DB_PASSWORD=<password>
COGNITO_USER_POOL_ID=<your-user-pool-id>
AWS_REGION=us-east-1
BEDROCK_REGION=us-east-1
DJANGO_SECRET_KEY=<any-random-string>
```

### 5b — airbee-cognito-trigger (Python)

```bash
cd aws/cognito-trigger-py
pip install -r requirements.txt -t package/
cp lambda_function.py package/
cd package && zip -r ../function.zip . && cd ..
```

In Lambda Console:
- Runtime: **Python 3.12**
- Handler: `lambda_function.handler`
- Role: `airbee-lambda-role`
- Timeout: **30s**
- Memory: **256MB**

**Environment variables:**
```
DB_HOST=<rds-endpoint>
DB_PORT=5432
DB_NAME=airbee
DB_USER=airbee
DB_PASSWORD=<password>
AWS_REGION=us-east-1
```

---

## Step 6 — Attach Cognito Trigger

1. Cognito Console → Your User Pool → User pool properties → Triggers
2. Post confirmation trigger → Select `airbee-cognito-trigger` Lambda

---

## Step 7 — Create API Gateway HTTP API

1. API Gateway Console → Create API → HTTP API
2. Add integration: `airbee-backend` Lambda
3. Add JWT Authorizer:
   - Issuer: `https://cognito-idp.us-east-1.amazonaws.com/<USER_POOL_ID>`
   - Audience: `<APP_CLIENT_ID>`

**Routes (both point to the single airbee-backend Lambda):**
```
ANY  /api/{proxy+}   → airbee-backend  [JWT auth]
ANY  /ai/{proxy+}    → airbee-backend  [JWT auth]
```

4. CORS: Origins `*`, Methods `*`, Headers: `Authorization, Content-Type`
5. Note the **API Gateway URL** (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com`)

---

## Step 8 — Deploy Frontend on AWS Amplify

1. Amplify Console → New App → Host web app → GitHub
2. Select repo, branch: `insaf` (or `main`)
3. Build settings: auto-detected from `amplify.yml` in repo root

**Environment variables in Amplify:**
```
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

4. Deploy → Wait for build to complete
5. Note the Amplify URL (e.g., `https://main.d1234abcd.amplifyapp.com`)

---

## Backend File Structure

```
aws/
├── database/schema.sql             ← Run once on RDS
├── backend/                        ← Single Django Lambda (ALL routes)
│   ├── lambda_handler.py           ← Mangum entry point
│   ├── requirements.txt
│   ├── airbee/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── asgi.py
│   └── api/
│       ├── auth.py                 ← Cognito JWT verification
│       ├── urls.py                 ← CRUD routes (/api/*)
│       ├── urls_ai.py              ← AI routes (/ai/*)
│       └── views/
│           ├── rooms.py
│           ├── bookings.py
│           ├── guests.py
│           ├── housekeeping.py
│           ├── settings_view.py
│           ├── dashboard.py
│           └── ai.py               ← All 7 AI endpoints (Bedrock)
└── cognito-trigger-py/             ← Signup trigger (separate Lambda)
    ├── lambda_function.py
    └── requirements.txt
```

---

## Verification Checklist

- [ ] Sign up with a new email
- [ ] Check email for verification code
- [ ] Enter code → lands on `/admin`
- [ ] Dashboard loads with stats (no errors in console)
- [ ] Click "Daily AI Briefing" → AI response appears
- [ ] Create a room → appears in room list
- [ ] Create a booking → appears in bookings table
- [ ] Click Forecasting → Bedrock response renders charts
- [ ] Click AI Copilot → type a question → response appears

---

## Quick Debug

**Lambda not connecting to RDS?**
- Check security group allows Lambda IP (or 0.0.0.0/0 for hackathon)
- Verify DB_HOST is the full RDS endpoint

**Bedrock `AccessDeniedException`?**
- Enable model access in Bedrock console
- Verify Lambda IAM role has `bedrock:InvokeModel` permission

**CORS errors in browser?**
- Verify API Gateway CORS is configured
- `django-cors-headers` handles it inside Django too (`CORS_ALLOW_ALL_ORIGINS = True`)

**Cognito trigger not firing?**
- Verify trigger is attached in Cognito User Pool → Triggers
- Check Lambda CloudWatch logs for errors

**401 Unauthorized from API?**
- Ensure `COGNITO_USER_POOL_ID` env var is set on `airbee-backend` Lambda
- Check the JWT Authorizer issuer URL matches your User Pool ID exactly

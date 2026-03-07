# ============================================================
# AIR BEE — Full AWS Deployment Script (PowerShell)
# Usage: .\deploy.ps1
# ============================================================
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── AWS CLI wrapper (installed via pip, may not be in PATH) ──
function Invoke-AWS {
    $result = python -m awscli @args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "AWS CLI error: $result" }
    return $result
}
Set-Alias -Name aws -Value Invoke-AWS -Scope Script

# ── Config ────────────────────────────────────────────────────
$REGION      = "ap-south-1"
$PROJECT     = "airbee"
$LAMBDA_ROLE = "airbee-lambda-role"
$DB_NAME     = "airbee"
$DB_USER     = "airbee"
$DB_PASS     = "AirBee2025!" # Change this to your preferred password
$ROOT        = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND_DIR = "$ROOT\aws\backend"
$TRIGGER_DIR = "$ROOT\aws\cognito-trigger-py"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  AIR BEE — AWS Deployment" -ForegroundColor Cyan
Write-Host "  Region: $REGION" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 0: Check AWS credentials ────────────────────────────
Write-Host "[0/8] Checking AWS credentials..." -ForegroundColor Yellow
$identity = $null
$id = $null
try {
    $identity = python -m awscli sts get-caller-identity --output json 2>&1
    if ($LASTEXITCODE -ne 0 -or -not $identity) {
        $identityText = if ($identity) { ($identity | Out-String).Trim() } else { "No output from AWS CLI." }
        throw "Unable to read AWS caller identity. $identityText"
    }
    $id = $identity | ConvertFrom-Json
    if (-not $id.Account) {
        throw "AWS CLI returned unexpected caller identity payload."
    }
    Write-Host "  Account: $($id.Account) | ARN: $($id.Arn)" -ForegroundColor Green
} catch {
    Write-Host "" -ForegroundColor Red
    Write-Host "  AWS credentials not configured!" -ForegroundColor Red
    Write-Host "  Run: python -m awscli configure" -ForegroundColor Yellow
    Write-Host "  Enter: AWS Access Key ID, Secret Access Key, region=$REGION, output=json" -ForegroundColor Yellow
    Write-Host "  Details: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$ACCOUNT_ID = $id.Account

# ── Step 1: IAM Role ──────────────────────────────────────────
Write-Host ""
Write-Host "[1/8] Creating IAM Role: $LAMBDA_ROLE..." -ForegroundColor Yellow

$trustPolicy = @'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
'@
$trustFile = "$env:TEMP\airbee-trust.json"
$trustPolicy | Out-File -FilePath $trustFile -Encoding ascii

$roleExists = & { $ErrorActionPreference = "Continue"; python -m awscli iam get-role --role-name $LAMBDA_ROLE --output json 2>$null }
if ($LASTEXITCODE -ne 0) {
    python -m awscli iam create-role `
        --role-name $LAMBDA_ROLE `
        --assume-role-policy-document "file://$trustFile" `
        --output json | Out-Null
    Write-Host "  Role created." -ForegroundColor Green
} else {
    Write-Host "  Role already exists, skipping." -ForegroundColor Gray
}
$requiredPolicyArns = @(
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    "arn:aws:iam::aws:policy/AmazonBedrockFullAccess",
    "arn:aws:iam::aws:policy/AmazonCognitoPowerUser",
    "arn:aws:iam::aws:policy/AmazonRDSFullAccess"
)
foreach ($policyArn in $requiredPolicyArns) {
    $attachOut = & {
        $ErrorActionPreference = "Continue"
        python -m awscli iam attach-role-policy `
            --role-name $LAMBDA_ROLE `
            --policy-arn $policyArn 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed attaching policy $policyArn to $LAMBDA_ROLE. $($attachOut | Out-String)"
    }
    Write-Host "  Policy ensured: $policyArn" -ForegroundColor Green
}
Write-Host "  Waiting 15s for role to propagate..." -ForegroundColor Gray
Start-Sleep -Seconds 15

$ROLE_ARN = "arn:aws:iam::${ACCOUNT_ID}:role/$LAMBDA_ROLE"

# ── Step 2: Cognito User Pool ─────────────────────────────────
Write-Host ""
Write-Host "[2/8] Creating Cognito User Pool..." -ForegroundColor Yellow

$poolList = python -m awscli cognito-idp list-user-pools --max-results 20 --region $REGION --output json | ConvertFrom-Json
$existingPool = $poolList.UserPools | Where-Object { $_.Name -eq "airbee-pool" } | Select-Object -First 1

if ($existingPool) {
    $POOL_ID = $existingPool.Id
    Write-Host "  Existing pool: $POOL_ID" -ForegroundColor Gray
} else {
    $schemaPath = "$env:TEMP\airbee-cognito-schema.json"
    $schemaJson = '[{"Name":"email","Required":true,"Mutable":true},{"Name":"name","Required":false,"Mutable":true},{"Name":"tenant_id","AttributeDataType":"String","Mutable":true}]'
    $schemaJson | Out-File -FilePath $schemaPath -Encoding ascii

    $policiesPath = "$env:TEMP\airbee-cognito-policies.json"
    $policiesJson = '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":false,"RequireLowercase":false,"RequireNumbers":false,"RequireSymbols":false}}'
    $policiesJson | Out-File -FilePath $policiesPath -Encoding ascii

    $poolRaw = & {
        $ErrorActionPreference = "Continue"
        python -m awscli cognito-idp create-user-pool `
            --pool-name "airbee-pool" `
            --region $REGION `
            --auto-verified-attributes email `
            --username-attributes email `
            --schema "file://$schemaPath" `
            --policies "file://$policiesPath" `
            --output json 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create Cognito user pool. $($poolRaw | Out-String)"
    }
    $poolResult = $poolRaw | ConvertFrom-Json
    if (-not $poolResult.UserPool.Id) {
        throw "Cognito create-user-pool succeeded but response did not include UserPool.Id"
    }
    $POOL_ID = $poolResult.UserPool.Id
    Write-Host "  Pool created: $POOL_ID" -ForegroundColor Green
}

# Create/find App Client
$clientList = python -m awscli cognito-idp list-user-pool-clients --user-pool-id $POOL_ID --region $REGION --output json | ConvertFrom-Json
$existingClient = $clientList.UserPoolClients | Where-Object { $_.ClientName -eq "airbee-frontend" } | Select-Object -First 1

if ($existingClient) {
    $CLIENT_ID = $existingClient.ClientId
    Write-Host "  Existing app client: $CLIENT_ID" -ForegroundColor Gray
} else {
    $clientRaw = & {
        $ErrorActionPreference = "Continue"
        python -m awscli cognito-idp create-user-pool-client `
            --user-pool-id $POOL_ID `
            --client-name "airbee-frontend" `
            --no-generate-secret `
            --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH `
            --region $REGION `
            --output json 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create Cognito app client. $($clientRaw | Out-String)"
    }
    $clientResult = $clientRaw | ConvertFrom-Json
    if (-not $clientResult.UserPoolClient.ClientId) {
        throw "Cognito create-user-pool-client response missing ClientId"
    }
    $CLIENT_ID = $clientResult.UserPoolClient.ClientId
    Write-Host "  App client created: $CLIENT_ID" -ForegroundColor Green
}

# ── Step 3: RDS PostgreSQL ────────────────────────────────────
Write-Host ""
Write-Host "[3/8] Creating RDS PostgreSQL..." -ForegroundColor Yellow

$dbExists = & { $ErrorActionPreference = "Continue"; python -m awscli rds describe-db-instances --db-instance-identifier "airbee-db" --region $REGION --output json 2>$null }
if ($LASTEXITCODE -ne 0) {
    # Get default VPC subnets
    $defaultVpc = python -m awscli ec2 describe-vpcs --filters "Name=isDefault,Values=true" --region $REGION --output json | ConvertFrom-Json
    $VPC_ID = $defaultVpc.Vpcs[0].VpcId

    $subnets = python -m awscli ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --region $REGION --output json | ConvertFrom-Json
    $subnetIds = ($subnets.Subnets | Select-Object -ExpandProperty SubnetId) -join " "

    # Create subnet group
    $sgExists = & { $ErrorActionPreference = "Continue"; python -m awscli rds describe-db-subnet-groups --db-subnet-group-name "airbee-subnet-group" --region $REGION --output json 2>$null }
    if ($LASTEXITCODE -ne 0) {
        python -m awscli rds create-db-subnet-group `
            --db-subnet-group-name "airbee-subnet-group" `
            --db-subnet-group-description "AIR BEE subnet group" `
            --subnet-ids $subnets.Subnets.SubnetId `
            --region $REGION `
            --output json | Out-Null
        Write-Host "  Subnet group created." -ForegroundColor Green
    }

    # Create security group for DB
    $dbSgResult = & {
        $ErrorActionPreference = "Continue"
        python -m awscli ec2 create-security-group `
            --group-name "airbee-db-sg" `
            --description "AIR BEE RDS access" `
            --vpc-id $VPC_ID `
            --region $REGION `
            --output json 2>$null
    }
    if ($LASTEXITCODE -eq 0) {
        $DB_SG_ID = ($dbSgResult | ConvertFrom-Json).GroupId
        python -m awscli ec2 authorize-security-group-ingress `
            --group-id $DB_SG_ID `
            --protocol tcp `
            --port 5432 `
            --cidr 0.0.0.0/0 `
            --region $REGION `
            --output json | Out-Null
        Write-Host "  Security group created: $DB_SG_ID" -ForegroundColor Green
    } else {
        # Get existing SG
        $existingSg = python -m awscli ec2 describe-security-groups --filters "Name=group-name,Values=airbee-db-sg" "Name=vpc-id,Values=$VPC_ID" --region $REGION --output json | ConvertFrom-Json
        $DB_SG_ID = $existingSg.SecurityGroups[0].GroupId
    }

    python -m awscli rds create-db-instance `
        --db-instance-identifier "airbee-db" `
        --db-instance-class "db.t3.micro" `
        --engine "postgres" `
        --engine-version "15" `
        --master-username $DB_USER `
        --master-user-password $DB_PASS `
        --allocated-storage 20 `
        --db-name $DB_NAME `
        --vpc-security-group-ids $DB_SG_ID `
        --db-subnet-group-name "airbee-subnet-group" `
        --publicly-accessible `
        --no-multi-az `
        --no-deletion-protection `
        --region $REGION `
        --output json | Out-Null

    Write-Host "  RDS instance creation started (takes ~5 min)..." -ForegroundColor Green
    Write-Host "  Waiting for RDS to become available..." -ForegroundColor Yellow

    $maxWait = 60  # 60 * 10s = 10 minutes
    $attempt = 0
    do {
        Start-Sleep -Seconds 10
        $attempt++
        $dbState = python -m awscli rds describe-db-instances --db-instance-identifier "airbee-db" --region $REGION --output json | ConvertFrom-Json
        $status = $dbState.DBInstances[0].DBInstanceStatus
        Write-Host "  Status: $status ($($attempt*10)s)" -ForegroundColor Gray
    } while ($status -ne "available" -and $attempt -lt $maxWait)

    if ($status -ne "available") { throw "RDS did not become available in time." }
    $DB_HOST = $dbState.DBInstances[0].Endpoint.Address
} else {
    $dbInfo = $dbExists | ConvertFrom-Json
    $DB_HOST = $dbInfo.DBInstances[0].Endpoint.Address
    Write-Host "  Existing RDS: $DB_HOST" -ForegroundColor Gray
}

Write-Host "  DB Host: $DB_HOST" -ForegroundColor Green

# ── Step 4: Run DB Schema ─────────────────────────────────────
Write-Host ""
Write-Host "[4/8] Running database schema..." -ForegroundColor Yellow

$schemaFile = "$ROOT\aws\database\schema.sql"
if (Test-Path $schemaFile) {
    python -c @"
import psycopg2, sys
try:
    conn = psycopg2.connect(host='$DB_HOST', port=5432, dbname='$DB_NAME', user='$DB_USER', password='$DB_PASS', sslmode='require', connect_timeout=15)
    conn.autocommit = True
    with open(r'$schemaFile', 'r') as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.close()
    print('Schema applied successfully')
except Exception as e:
    print(f'Schema error: {e}', file=sys.stderr)
    sys.exit(1)
"@
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: Schema may already exist or there was an error. Continuing..." -ForegroundColor Yellow
    } else {
        Write-Host "  Schema applied." -ForegroundColor Green
    }
} else {
    Write-Host "  Schema file not found at $schemaFile" -ForegroundColor Red
}

$migrationsDir = "$ROOT\aws\database\migrations"
if (Test-Path $migrationsDir) {
    python -c @"
import pathlib, psycopg2, sys
try:
    conn = psycopg2.connect(host='$DB_HOST', port=5432, dbname='$DB_NAME', user='$DB_USER', password='$DB_PASS', sslmode='require', connect_timeout=15)
    conn.autocommit = True
    migration_dir = pathlib.Path(r'$migrationsDir')
    for path in sorted(migration_dir.glob('*.sql')):
        with open(path, 'r', encoding='utf-8') as f:
            sql = f.read()
        with conn.cursor() as cur:
            cur.execute(sql)
        print(f'Applied migration: {path.name}')
    conn.close()
except Exception as e:
    print(f'Migration error: {e}', file=sys.stderr)
    sys.exit(1)
"@
    if ($LASTEXITCODE -ne 0) {
        throw "Database migrations failed."
    } else {
        Write-Host "  Migrations applied." -ForegroundColor Green
    }
}

# ── Step 5: Package Lambda Functions ─────────────────────────
Write-Host ""
Write-Host "[5/8] Packaging Lambda functions..." -ForegroundColor Yellow

# Backend Lambda package
$backendPkg = "$BACKEND_DIR\package"
if (Test-Path $backendPkg) { Remove-Item -Recurse -Force $backendPkg }
New-Item -ItemType Directory -Path $backendPkg | Out-Null

Write-Host "  Installing Python dependencies for Linux x86_64..." -ForegroundColor Gray
python -m pip install `
    --platform manylinux2014_x86_64 `
    --python-version 3.12 `
    --only-binary=:all: `
    --implementation cp `
    --quiet `
    -r "$BACKEND_DIR\requirements.txt" `
    -t $backendPkg
if ($LASTEXITCODE -ne 0) { throw "pip install failed for backend" }

# Copy source
Copy-Item -Recurse -Force "$BACKEND_DIR\airbee" "$backendPkg\airbee"
Copy-Item -Recurse -Force "$BACKEND_DIR\api" "$backendPkg\api"
Copy-Item -Force "$BACKEND_DIR\lambda_handler.py" "$backendPkg\lambda_handler.py"

# Zip using Python (cross-platform)
$backendZip = "$BACKEND_DIR\function.zip"
if (Test-Path $backendZip) { Remove-Item $backendZip }
python -c @"
import zipfile, os, pathlib
pkg = pathlib.Path(r'$backendPkg')
out = r'$backendZip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in pkg.rglob('*'):
        if f.is_file():
            zf.write(f, f.relative_to(pkg))
print(f'Zipped: {os.path.getsize(out)/1024/1024:.1f} MB')
"@
Write-Host "  Backend package ready." -ForegroundColor Green

# Cognito trigger package
$triggerPkg = "$TRIGGER_DIR\package"
if (Test-Path $triggerPkg) { Remove-Item -Recurse -Force $triggerPkg }
New-Item -ItemType Directory -Path $triggerPkg | Out-Null

python -m pip install `
    --platform manylinux2014_x86_64 `
    --python-version 3.12 `
    --only-binary=:all: `
    --implementation cp `
    --quiet `
    -r "$TRIGGER_DIR\requirements.txt" `
    -t $triggerPkg
if ($LASTEXITCODE -ne 0) { throw "pip install failed for cognito trigger" }
Copy-Item -Force "$TRIGGER_DIR\lambda_function.py" "$triggerPkg\lambda_function.py"

$triggerZip = "$TRIGGER_DIR\function.zip"
if (Test-Path $triggerZip) { Remove-Item $triggerZip }
python -c @"
import zipfile, os, pathlib
pkg = pathlib.Path(r'$triggerPkg')
out = r'$triggerZip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in pkg.rglob('*'):
        if f.is_file():
            zf.write(f, f.relative_to(pkg))
print(f'Zipped: {os.path.getsize(out)/1024/1024:.1f} MB')
"@
Write-Host "  Trigger package ready." -ForegroundColor Green

# ── Step 6: Deploy Lambda Functions ──────────────────────────
Write-Host ""
Write-Host "[6/8] Deploying Lambda functions..." -ForegroundColor Yellow

# Build backend Lambda environment map.
# Supports Bedrock API key auth when AWS_BEARER_TOKEN_BEDROCK is provided.
$backendEnvMap = [ordered]@{
    DB_HOST              = $DB_HOST
    DB_PORT              = "5432"
    DB_NAME              = $DB_NAME
    DB_USER              = $DB_USER
    DB_PASSWORD          = $DB_PASS
    COGNITO_USER_POOL_ID = $POOL_ID
    BEDROCK_REGION       = $REGION
    BEDROCK_MODEL_ID     = "anthropic.claude-3-haiku-20240307-v1:0"
    BEDROCK_FALLBACK_MODEL_ID = "apac.amazon.nova-lite-v1:0"
    DJANGO_SECRET_KEY    = "airbee-hackathon-secret-2025"
}

# Preserve existing bearer token if already set in Lambda and no new one passed.
$existingBackendCfg = & {
    $ErrorActionPreference = "Continue"
    python -m awscli lambda get-function-configuration --function-name "airbee-backend" --region $REGION --output json 2>$null
}
$existingBearer = $null
if ($LASTEXITCODE -eq 0 -and $existingBackendCfg) {
    try {
        $parsedExisting = $existingBackendCfg | ConvertFrom-Json
        $existingBearer = $parsedExisting.Environment.Variables.AWS_BEARER_TOKEN_BEDROCK
    } catch {
        $existingBearer = $null
    }
}

$bearerToken = $env:AWS_BEARER_TOKEN_BEDROCK
if (-not $bearerToken -and $existingBearer) {
    $bearerToken = $existingBearer
    Write-Host "  Preserving existing AWS_BEARER_TOKEN_BEDROCK in Lambda config." -ForegroundColor Gray
}
if ($bearerToken) {
    $backendEnvMap["AWS_BEARER_TOKEN_BEDROCK"] = $bearerToken
    Write-Host "  Bedrock API key auth enabled for backend Lambda." -ForegroundColor Gray
}

$backendEnvPath = "$env:TEMP\airbee-backend-env.json"
(@{ Variables = $backendEnvMap } | ConvertTo-Json -Compress) | Out-File -FilePath $backendEnvPath -Encoding ascii

# Deploy airbee-backend
$fnExists = & { $ErrorActionPreference = "Continue"; python -m awscli lambda get-function --function-name "airbee-backend" --region $REGION --output json 2>$null }
if ($LASTEXITCODE -ne 0) {
    $backendCreateOut = & {
        $ErrorActionPreference = "Continue"
        python -m awscli lambda create-function `
            --function-name "airbee-backend" `
            --runtime "python3.12" `
            --role $ROLE_ARN `
            --handler "lambda_handler.handler" `
            --zip-file "fileb://$backendZip" `
            --timeout 60 `
            --memory-size 512 `
            --environment "file://$backendEnvPath" `
            --region $REGION `
            --output json 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create Lambda airbee-backend. $($backendCreateOut | Out-String)"
    }
    Write-Host "  Created: airbee-backend" -ForegroundColor Green
} else {
    $backendCodeOut = & {
        $ErrorActionPreference = "Continue"
        python -m awscli lambda update-function-code `
            --function-name "airbee-backend" `
            --zip-file "fileb://$backendZip" `
            --region $REGION `
            --output json 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed updating code for Lambda airbee-backend. $($backendCodeOut | Out-String)"
    }

    Start-Sleep -Seconds 5

    $backendCfgOut = & {
        $ErrorActionPreference = "Continue"
        python -m awscli lambda update-function-configuration `
            --function-name "airbee-backend" `
            --timeout 60 `
            --memory-size 512 `
            --environment "file://$backendEnvPath" `
            --region $REGION `
            --output json 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed updating configuration for Lambda airbee-backend. $($backendCfgOut | Out-String)"
    }
    Write-Host "  Updated: airbee-backend" -ForegroundColor Green
}

# Deploy airbee-cognito-trigger
$triggerEnvVars = "DB_HOST=$DB_HOST,DB_PORT=5432,DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_PASSWORD=$DB_PASS"
$triggerExists = & { $ErrorActionPreference = "Continue"; python -m awscli lambda get-function --function-name "airbee-cognito-trigger" --region $REGION --output json 2>$null }
if ($LASTEXITCODE -ne 0) {
    $triggerCreateOut = & {
        $ErrorActionPreference = "Continue"
        python -m awscli lambda create-function `
            --function-name "airbee-cognito-trigger" `
            --runtime "python3.12" `
            --role $ROLE_ARN `
            --handler "lambda_function.handler" `
            --zip-file "fileb://$triggerZip" `
            --timeout 30 `
            --memory-size 256 `
            --environment "Variables={$triggerEnvVars}" `
            --region $REGION `
            --output json 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create Lambda airbee-cognito-trigger. $($triggerCreateOut | Out-String)"
    }
    Write-Host "  Created: airbee-cognito-trigger" -ForegroundColor Green
} else {
    $triggerCodeOut = & {
        $ErrorActionPreference = "Continue"
        python -m awscli lambda update-function-code `
            --function-name "airbee-cognito-trigger" `
            --zip-file "fileb://$triggerZip" `
            --region $REGION `
            --output json 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed updating code for Lambda airbee-cognito-trigger. $($triggerCodeOut | Out-String)"
    }

    Start-Sleep -Seconds 5

    $triggerCfgOut = & {
        $ErrorActionPreference = "Continue"
        python -m awscli lambda update-function-configuration `
            --function-name "airbee-cognito-trigger" `
            --environment "Variables={$triggerEnvVars}" `
            --region $REGION `
            --output json 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Failed updating configuration for Lambda airbee-cognito-trigger. $($triggerCfgOut | Out-String)"
    }
    Write-Host "  Updated: airbee-cognito-trigger" -ForegroundColor Green
}

# Attach Cognito trigger
$TRIGGER_ARN = "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:airbee-cognito-trigger"
try {
    python -m awscli lambda add-permission `
        --function-name "airbee-cognito-trigger" `
        --statement-id "CognitoPostConfirmation" `
        --action "lambda:InvokeFunction" `
        --principal "cognito-idp.amazonaws.com" `
        --source-arn "arn:aws:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/${POOL_ID}" `
        --region $REGION `
        --output json 2>&1 | Out-Null
} catch { <# permission may already exist #> }

python -m awscli cognito-idp update-user-pool `
    --user-pool-id $POOL_ID `
    --region $REGION `
    --lambda-config "PostConfirmation=$TRIGGER_ARN" `
    --output json | Out-Null
Write-Host "  Cognito trigger attached." -ForegroundColor Green

# ── Step 7: API Gateway ───────────────────────────────────────
Write-Host ""
Write-Host "[7/8] Setting up API Gateway..." -ForegroundColor Yellow

$BACKEND_ARN = "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:airbee-backend"
$INTEGRATION_URI = "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${BACKEND_ARN}/invocations"
$ISSUER = "https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}"

$apiList = python -m awscli apigatewayv2 get-apis --region $REGION --output json | ConvertFrom-Json
$existingApi = $apiList.Items | Where-Object { $_.Name -eq "airbee-api" } | Select-Object -First 1

if ($existingApi) {
    $API_ID = $existingApi.ApiId
    Write-Host "  Existing API: $API_ID" -ForegroundColor Gray
} else {
    $apiResult = python -m awscli apigatewayv2 create-api `
        --name "airbee-api" `
        --protocol-type HTTP `
        --cors-configuration 'AllowOrigins=["*"],AllowMethods=["*"],AllowHeaders=["Authorization","Content-Type"]' `
        --region $REGION `
        --output json | ConvertFrom-Json
    $API_ID = $apiResult.ApiId
    Write-Host "  API created: $API_ID" -ForegroundColor Green
}

# Ensure CORS is configured (important for Amplify frontend + preflight)
python -m awscli apigatewayv2 update-api `
    --api-id $API_ID `
    --cors-configuration 'AllowOrigins=["*"],AllowMethods=["*"],AllowHeaders=["Authorization","Content-Type"]' `
    --region $REGION `
    --output json | Out-Null

# Ensure Lambda integration
$integList = python -m awscli apigatewayv2 get-integrations --api-id $API_ID --region $REGION --output json | ConvertFrom-Json
$existingIntegration = $integList.Items | Where-Object { $_.IntegrationUri -eq $INTEGRATION_URI } | Select-Object -First 1
if ($existingIntegration) {
    $INTEGRATION_ID = $existingIntegration.IntegrationId
    Write-Host "  Integration ensured: $INTEGRATION_ID" -ForegroundColor Gray
} else {
    $integResult = python -m awscli apigatewayv2 create-integration `
        --api-id $API_ID `
        --integration-type AWS_PROXY `
        --integration-uri $INTEGRATION_URI `
        --payload-format-version "2.0" `
        --region $REGION `
        --output json | ConvertFrom-Json
    $INTEGRATION_ID = $integResult.IntegrationId
    Write-Host "  Integration created: $INTEGRATION_ID" -ForegroundColor Green
}

# Ensure JWT authorizer
$authList = python -m awscli apigatewayv2 get-authorizers --api-id $API_ID --region $REGION --output json | ConvertFrom-Json
$existingAuth = $authList.Items | Where-Object { $_.Name -eq "cognito-jwt" } | Select-Object -First 1
if ($existingAuth) {
    $AUTH_ID = $existingAuth.AuthorizerId
    python -m awscli apigatewayv2 update-authorizer `
        --api-id $API_ID `
        --authorizer-id $AUTH_ID `
        --authorizer-type JWT `
        --identity-source '$request.header.Authorization' `
        --name "cognito-jwt" `
        --jwt-configuration "Issuer=$ISSUER,Audience=$CLIENT_ID" `
        --region $REGION `
        --output json | Out-Null
    Write-Host "  Authorizer ensured: $AUTH_ID" -ForegroundColor Gray
} else {
    $authResult = python -m awscli apigatewayv2 create-authorizer `
        --api-id $API_ID `
        --authorizer-type JWT `
        --identity-source '$request.header.Authorization' `
        --name "cognito-jwt" `
        --jwt-configuration "Issuer=$ISSUER,Audience=$CLIENT_ID" `
        --region $REGION `
        --output json | ConvertFrom-Json
    $AUTH_ID = $authResult.AuthorizerId
    Write-Host "  Authorizer created: $AUTH_ID" -ForegroundColor Green
}

# Ensure routes (protected business routes)
$routeList = python -m awscli apigatewayv2 get-routes --api-id $API_ID --region $REGION --output json | ConvertFrom-Json
@("ANY /api/{proxy+}", "ANY /ai/{proxy+}") | ForEach-Object {
    $routeKey = $_
    $existingRoute = $routeList.Items | Where-Object { $_.RouteKey -eq $routeKey } | Select-Object -First 1
    if ($existingRoute) {
        python -m awscli apigatewayv2 update-route `
            --api-id $API_ID `
            --route-id $existingRoute.RouteId `
            --target "integrations/$INTEGRATION_ID" `
            --authorization-type JWT `
            --authorizer-id $AUTH_ID `
            --region $REGION `
            --output json | Out-Null
        Write-Host "  Route ensured: $routeKey (JWT)" -ForegroundColor Gray
    } else {
        python -m awscli apigatewayv2 create-route `
            --api-id $API_ID `
            --route-key $routeKey `
            --target "integrations/$INTEGRATION_ID" `
            --authorization-type JWT `
            --authorizer-id $AUTH_ID `
            --region $REGION `
            --output json | Out-Null
        Write-Host "  Route created: $routeKey (JWT)" -ForegroundColor Green
    }
}

# Ensure public routes remain unauthenticated
@("ANY /public/{proxy+}") | ForEach-Object {
    $routeKey = $_
    $existingRoute = $routeList.Items | Where-Object { $_.RouteKey -eq $routeKey } | Select-Object -First 1
    if ($existingRoute) {
        python -m awscli apigatewayv2 update-route `
            --api-id $API_ID `
            --route-id $existingRoute.RouteId `
            --target "integrations/$INTEGRATION_ID" `
            --authorization-type NONE `
            --region $REGION `
            --output json | Out-Null
        Write-Host "  Route ensured: $routeKey (NONE)" -ForegroundColor Gray
    } else {
        python -m awscli apigatewayv2 create-route `
            --api-id $API_ID `
            --route-key $routeKey `
            --target "integrations/$INTEGRATION_ID" `
            --authorization-type NONE `
            --region $REGION `
            --output json | Out-Null
        Write-Host "  Route created: $routeKey (NONE)" -ForegroundColor Green
    }
}

# Ensure OPTIONS routes are public (avoids browser CORS preflight 401)
@("OPTIONS /api/{proxy+}", "OPTIONS /ai/{proxy+}", "OPTIONS /public/{proxy+}") | ForEach-Object {
    $routeKey = $_
    $existingRoute = $routeList.Items | Where-Object { $_.RouteKey -eq $routeKey } | Select-Object -First 1
    if ($existingRoute) {
        python -m awscli apigatewayv2 update-route `
            --api-id $API_ID `
            --route-id $existingRoute.RouteId `
            --target "integrations/$INTEGRATION_ID" `
            --authorization-type NONE `
            --region $REGION `
            --output json | Out-Null
        Write-Host "  Route ensured: $routeKey (NONE)" -ForegroundColor Gray
    } else {
        python -m awscli apigatewayv2 create-route `
            --api-id $API_ID `
            --route-key $routeKey `
            --target "integrations/$INTEGRATION_ID" `
            --authorization-type NONE `
            --region $REGION `
            --output json | Out-Null
        Write-Host "  Route created: $routeKey (NONE)" -ForegroundColor Green
    }
}

# Ensure default stage exists and auto-deploy is on
$stageList = python -m awscli apigatewayv2 get-stages --api-id $API_ID --region $REGION --output json | ConvertFrom-Json
$defaultStage = $stageList.Items | Where-Object { $_.StageName -eq '$default' } | Select-Object -First 1
if ($defaultStage) {
    python -m awscli apigatewayv2 update-stage `
        --api-id $API_ID `
        --stage-name '$default' `
        --auto-deploy `
        --region $REGION `
        --output json | Out-Null
} else {
    python -m awscli apigatewayv2 create-stage `
        --api-id $API_ID `
        --stage-name '$default' `
        --auto-deploy `
        --region $REGION `
        --output json | Out-Null
}

# Allow API Gateway to invoke Lambda (ensure every run, including existing API)
try {
    python -m awscli lambda add-permission `
        --function-name "airbee-backend" `
        --statement-id "ApiGatewayInvoke" `
        --action "lambda:InvokeFunction" `
        --principal "apigateway.amazonaws.com" `
        --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" `
        --region $REGION `
        --output json 2>&1 | Out-Null
} catch { <# permission may already exist #> }

$API_URL = "https://${API_ID}.execute-api.${REGION}.amazonaws.com"
Write-Host "  API URL: $API_URL" -ForegroundColor Green

# ── Step 8: Write frontend .env.local ─────────────────────────
Write-Host ""
Write-Host "[8/8] Writing frontend environment..." -ForegroundColor Yellow

$envContent = @"
VITE_COGNITO_USER_POOL_ID=$POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
VITE_API_URL=$API_URL
"@

$envContent | Out-File -FilePath "$ROOT\frontend\.env.local" -Encoding ascii
Write-Host "  Written: frontend\.env.local" -ForegroundColor Green

# ── Done ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend .env.local values:" -ForegroundColor Cyan
Write-Host $envContent
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. cd frontend && npm run dev  (test locally)"
Write-Host "  2. Push to GitHub, connect repo in AWS Amplify"
Write-Host "  3. Add the 3 VITE_ env vars in Amplify console"
Write-Host "  4. Deploy in Amplify"
Write-Host ""

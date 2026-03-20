# AIR BEE Prototype Performance Report

This document is the standard template for capturing frontend, API, and AI performance for the AIR BEE prototype.

Use it for:
- hackathon demos
- investor or judge review material
- before/after optimization comparisons
- deployment validation after infrastructure changes

## 1. Test Context

Fill this section before collecting metrics.

| Field | Value |
|---|---|
| Report date | |
| Environment | local / staging / production |
| Frontend URL | |
| API URL | |
| AWS region | us-east-1 |
| Build commit | |
| Tester | |
| Device profile | mobile / desktop |
| Browser | |
| Network profile | no throttling / fast 4G / slow 4G |

## 2. Current AIR BEE Architecture

AIR BEE currently uses:

- AWS Amplify for frontend hosting
- Amazon Cognito for authentication
- API Gateway HTTP API
- one backend Lambda for both `/api/*` and `/ai/*`
- PostgreSQL on RDS
- Amazon Bedrock for AI model inference

Reference:
- [DEPLOYMENT.md](f:/hackaton/DEPLOYMENT.md#L5)
- [DEPLOYMENT.md](f:/hackaton/DEPLOYMENT.md#L133)

Important implication:

- API Gateway route-level metrics aggregate all AI traffic into `/ai/{proxy+}`
- per-endpoint AI reporting requires API access logs or app-level timing

## 3. Executive Summary

Complete this after the measurements are collected.

| Metric | Result | Notes |
|---|---|---|
| Landing page Lighthouse Performance | | |
| Admin dashboard Lighthouse Performance | | |
| Public booking Lighthouse Performance | | |
| Dashboard average API latency | | |
| Dashboard p95 API latency | | |
| AI average latency | | |
| AI p95 latency | | |
| API error rate | | |
| AI error rate | | |
| Lambda cold start rate | | |
| Avg cold start init duration | | |

## 4. Frontend Bundle Report

Collect from:

```powershell
cd f:\hackaton\frontend
npm run build
```

Record the most relevant chunks here.

| Chunk | Size | Gzip | Notes |
|---|---|---|---|
| main entry | | | |
| charts | | | |
| amplify | | | |
| react | | | |
| vendor | | | |

Current implementation references:
- [vite.config.ts](f:/hackaton/frontend/vite.config.ts#L20)
- [App.tsx](f:/hackaton/frontend/src/App.tsx#L39)

## 5. Lighthouse Report

Run Lighthouse in Chrome DevTools for:

- `/`
- `/admin`
- `/book/:slug`

Recommended:
- run both Mobile and Desktop
- run at least 3 times and note the median

### 5.1 Landing Page

| Metric | Mobile | Desktop |
|---|---|---|
| Performance | | |
| Accessibility | | |
| Best Practices | | |
| SEO | | |
| FCP | | |
| LCP | | |
| TBT | | |
| CLS | | |

### 5.2 Admin Dashboard

| Metric | Mobile | Desktop |
|---|---|---|
| Performance | | |
| Accessibility | | |
| Best Practices | | |
| SEO | | |
| FCP | | |
| LCP | | |
| TBT | | |
| CLS | | |

### 5.3 Public Booking Page

| Metric | Mobile | Desktop |
|---|---|---|
| Performance | | |
| Accessibility | | |
| Best Practices | | |
| SEO | | |
| FCP | | |
| LCP | | |
| TBT | | |
| CLS | | |

## 6. Browser Network Timing

Use Chrome DevTools Network tab and capture:

- document load
- JS bundle load
- `/api/dashboard/stats`
- `/public/properties/:slug`
- `/ai/briefing`
- `/ai/copilot`
- `/ai/forecast`
- `/ai/pricing`
- `/ai/guest-intelligence`
- `/ai/sentiment`
- `/ai/booking-risk`

| Request | Avg ms | p95 ms | Status | Notes |
|---|---|---|---|---|
| `/api/dashboard/stats` | | | | |
| `/public/properties/:slug` | | | | |
| `/ai/briefing` | | | | |
| `/ai/copilot` | | | | |
| `/ai/forecast` | | | | |
| `/ai/pricing` | | | | |
| `/ai/guest-intelligence` | | | | |
| `/ai/sentiment` | | | | |
| `/ai/booking-risk` | | | | |

## 7. AWS Metrics

### 7.1 Required Metrics

For the deployed AWS prototype, report:

- average latency
- p95 latency
- error rate
- cold start impact for AI endpoints

Because AIR BEE currently routes all `/api/*` and `/ai/*` traffic through one Lambda, collect:

- API Gateway metrics for user-facing latency
- CloudWatch Lambda logs for cold starts
- API Gateway access logs for per-path AI timings

### 7.2 API Gateway Metrics

Use CloudWatch Metrics:

- Namespace: `AWS/ApiGateway`
- Dimensions: API ID, Stage

Capture:

| Metric | Statistic | Result |
|---|---|---|
| `Latency` | `Average` | |
| `Latency` | `p95` | |
| `4xx` | `Sum` | |
| `5xx` | `Sum` | |
| `Count` | `Sum` | |

Formula:

```text
Error Rate (%) = ((4xx + 5xx) / Count) * 100
```

### 7.3 Lambda Metrics

Use CloudWatch Metrics:

- Namespace: `AWS/Lambda`
- Function name: `airbee-backend`

Capture:

| Metric | Statistic | Result |
|---|---|---|
| `Duration` | `Average` | |
| `Duration` | `p95` | |
| `Errors` | `Sum` | |
| `Invocations` | `Sum` | |
| `Throttles` | `Sum` | |

### 7.4 API Gateway Access Logging

Enable HTTP API access logging with JSON output similar to:

```json
{
  "requestId":"$context.requestId",
  "routeKey":"$context.routeKey",
  "path":"$context.path",
  "status":"$context.status",
  "integrationStatus":"$context.integrationStatus",
  "integrationLatency":"$context.integrationLatency",
  "responseLatency":"$context.responseLatency"
}
```

This is required if you want per-endpoint AI metrics such as `/ai/forecast` versus `/ai/pricing`.

### 7.5 CloudWatch Logs Insights Queries

#### API requests by path

```sql
fields path, responseLatency, status
| filter path like /\/ai\//
| stats
    count(*) as requests,
    avg(responseLatency) as avgLatencyMs,
    percentile(responseLatency, 95) as p95LatencyMs
  by path
| sort path asc
```

#### API errors by path

```sql
fields path, status
| filter path like /\/ai\//
| stats
    count(*) as requests,
    sum(if(status >= 400, 1, 0)) as errors
  by path
| display path, requests, errors, (errors * 100.0 / requests) as errorRatePct
| sort path asc
```

#### Lambda duration

```sql
filter @type = "REPORT"
| stats
    count(*) as invocations,
    avg(@duration) as avgDurationMs,
    percentile(@duration, 95) as p95DurationMs
```

#### Lambda cold start rate

```sql
filter @type = "REPORT"
| stats
    count(*) as invocations,
    sum(if(strcontains(@message, "Init Duration"), 1, 0)) as coldStarts
| display invocations, coldStarts, (coldStarts * 100.0 / invocations) as coldStartPct
```

#### Lambda cold start init duration

```sql
filter @type = "REPORT"
| filter strcontains(@message, "Init Duration")
| parse @message /Init Duration: (?<initMs>[\d.]+) ms/
| stats
    count(*) as coldStarts,
    avg(initMs) as avgInitMs,
    percentile(initMs, 95) as p95InitMs
```

### 7.6 AWS Results Table

| Metric Area | Average | p95 | Error Rate | Notes |
|---|---|---|---|---|
| API Gateway overall | | | | |
| Lambda overall | | | | |
| `/ai/briefing` | | | | |
| `/ai/copilot` | | | | |
| `/ai/forecast` | | | | |
| `/ai/pricing` | | | | |
| `/ai/guest-intelligence` | | | | |
| `/ai/sentiment` | | | | |
| `/ai/booking-risk` | | | | |

## 8. Cold Start Impact for AI Endpoints

Use this section to explain the operational meaning of cold starts.

| Item | Result | Notes |
|---|---|---|
| Lambda cold start rate | | |
| Avg init duration | | |
| p95 init duration | | |
| AI endpoints most affected | | |

Interpretation guide:

- if cold start rate is high and AI endpoints are slow only on first request, the main issue is Lambda startup
- if cold start rate is low but AI latency is still high, the main issue is Bedrock inference time, DB time, or prompt size
- if API Gateway latency is much higher than Lambda duration, investigate network overhead or upstream integration behavior

## 9. Findings

Summarize the top bottlenecks.

Example format:

1. Dashboard payload was larger than necessary because it returned full room and booking lists.
2. AI endpoints had high latency due to large prompt payloads and model invocation time.
3. Initial bundle size was inflated by charting and auth dependencies in shared chunks.

## 10. Recommended Actions

Short-term:

1. Reduce AI prompt size further for forecasting, pricing, and guest intelligence.
2. Add short-lived caching for repeated AI analyses.
3. Add DB indexes on booking date and tenant-scoped query paths.
4. Keep heavy charting code lazy-loaded.

Medium-term:

1. Split `/ai/*` into separate Lambda integrations if per-endpoint metrics and scaling matter.
2. Add structured app-level timing logs around DB fetch, prompt build, and Bedrock invocation.
3. Add synthetic monitoring for `/admin`, `/book/:slug`, and core AI endpoints.

## 11. Commands Checklist

Frontend build:

```powershell
cd f:\hackaton\frontend
npm run build
```

Frontend preview:

```powershell
cd f:\hackaton\frontend
npm run preview
```

Existing approved AWS log commands in this environment:

```powershell
python -m awscli logs tail /aws/lambda/airbee-backend --since 15m --region ap-south-1
python -m awscli logs filter-log-events --log-group-name /aws/lambda/airbee-backend --start-time (([DateTimeOffset](Get-Date).AddMinutes(-10)).ToUnixTimeMilliseconds()) --region ap-south-1
```

Note:

- the AIR BEE deployment guide uses `us-east-1` for Bedrock-enabled deployment
- if your actual Lambda is in another region, use that exact region in all CloudWatch commands

## 12. Source References

- [DEPLOYMENT.md](f:/hackaton/DEPLOYMENT.md#L5)
- [DEPLOYMENT.md](f:/hackaton/DEPLOYMENT.md#L61)
- [DEPLOYMENT.md](f:/hackaton/DEPLOYMENT.md#L133)
- [App.tsx](f:/hackaton/frontend/src/App.tsx#L39)
- [vite.config.ts](f:/hackaton/frontend/vite.config.ts#L20)
- [api.ts](f:/hackaton/frontend/src/lib/api.ts#L13)
- [dashboard.py](f:/hackaton/aws/backend/api/views/dashboard.py#L24)
- [ai.py](f:/hackaton/aws/backend/api/views/ai.py#L111)

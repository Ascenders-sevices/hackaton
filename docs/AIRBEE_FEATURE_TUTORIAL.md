# AIR BEE Product Tutorial and Feature Guide

This document explains the AIR BEE product feature by feature, how each module works, what data it reads or writes, and how the modules connect to each other. It is written so you can use it as a tutorial script, onboarding guide, or product walkthrough reference.

## 1. Product Summary

AIR BEE is a multi-tenant hotel operations and revenue platform built around one property per signed-in account. It combines:

- hotel operations: rooms, bookings, guests, housekeeping, settings
- a public booking engine
- AI-driven operational insights
- messaging and marketing workflows

The platform has two main surfaces:

- a public website and public booking page
- an authenticated admin dashboard

## 2. Core Product Structure

### Public pages

- `/`
  - marketing landing page
- `/auth`
  - sign up and sign in
- `/book`
  - public booking page shell
- `/book/:slug`
  - guest-facing property booking page

### Admin pages

- `/admin`
  - dashboard
- `/admin/bookings`
  - booking management
- `/admin/rooms`
  - room inventory
- `/admin/guests`
  - guest profiles
- `/admin/marketing`
  - contacts, segments, campaigns
- `/admin/messaging`
  - templates and outreach logging
- `/admin/reports`
  - placeholder
- `/admin/settings`
  - property configuration
- `/admin/ai-copilot`
  - AI copilot
- `/admin/forecasting`
  - demand forecasting
- `/admin/dynamic-pricing`
  - room repricing insights
- `/admin/guest-intelligence`
  - guest scoring and segments
- `/admin/sentiment`
  - review sentiment analysis
- `/admin/booking-risk`
  - no-show and cancellation risk

## 3. Authentication and Tenant Model

AIR BEE uses Amazon Cognito for authentication in production.

How it works:

1. A user signs up from `/auth` using name, email, and password.
2. Cognito sends an email verification code.
3. After verification, the user signs in.
4. The frontend stores the Cognito session and uses the Cognito ID token for API calls.
5. The backend reads the authenticated user and tenant context from the token.

Important tenant rule:

- every admin API request is tenant-scoped
- a property only sees its own rooms, bookings, guests, templates, contacts, campaigns, and AI results

In local development, the app can also run in a bypass mode using `VITE_LOCAL_DEV=true`, which skips Cognito and injects a fixed local user profile.

## 4. Landing Page

Route:

- `/`

Purpose:

- explains the product value proposition
- shows the AI modules and feature set
- routes users to sign in or open the booking page

What it contains:

- hero section
- product benefits
- AI engine highlights
- feature grid
- hackathon and team branding

This page is a marketing surface. It does not manage property data directly.

## 5. Auth Page

Route:

- `/auth`

Purpose:

- sign in existing users
- sign up a new property owner
- confirm sign-up email code

Sign-up flow:

1. user enters full name, email, password
2. frontend calls Amplify sign-up
3. Cognito sends a verification code
4. user enters the code
5. frontend confirms the sign-up
6. frontend signs the user in and redirects to `/admin`

Sign-in flow:

1. user enters email and password
2. frontend signs in with Cognito
3. user is redirected to the admin dashboard

## 6. Admin Layout and Navigation

All admin pages sit inside the same layout:

- top sticky header
- collapsible left sidebar
- protected route behavior

If the user is not authenticated, `/admin/*` redirects to `/auth`.

Sidebar groups:

- Main
  - Dashboard, Bookings, Rooms, Guests
- AI Intelligence
  - AI Copilot, Forecasting, Dynamic Pricing, Guest Intelligence, Sentiment Analysis, Booking Risk
- Marketing
  - Marketing, Messaging
- System
  - Reports, Settings

## 7. Dashboard

Route:

- `/admin`

Purpose:

- give the operator a quick property-wide view of occupancy, bookings, revenue, operations, and AI alerts

What it shows:

- headline metrics
- occupancy and revenue charts
- room and booking snapshots
- links into AI modules
- daily AI briefing trigger

How it works:

- frontend loads dashboard data from `/api/dashboard/stats`
- when the user requests a briefing, frontend calls `/ai/briefing`
- the backend gathers rooms, bookings, guests, and tenant data
- the AI layer builds a property summary and asks the model to produce:
  - greeting
  - key metrics
  - priority actions
  - opportunities
  - risks
  - forecast note

Fallback behavior:

- if the model does not return valid structured JSON, the backend generates a rule-based briefing from the live property data

## 8. Rooms

Route:

- `/admin/rooms`

Purpose:

- manage room inventory for the property

What the user can do:

- create a room
- edit a room
- delete a room
- assign room category
- set pricing and guest capacity
- set operational status
- load demo inventory

Typical room fields:

- room name
- category
- base price
- max guests
- room status
- housekeeping status
- amenities
- images
- base occupancy
- extra guest fee
- minimum stay
- check-in and check-out times
- cancellation policy

How it works:

- frontend reads current rooms from `/api/rooms`
- frontend reads property settings and room categories from `/api/settings`
- create and edit operations write back through the room API
- room availability for the public booking engine depends on:
  - `status = available`
  - guest capacity
  - no conflicting pending or confirmed bookings for the selected dates

Why this page matters:

- rooms are the base inventory for bookings
- AI pricing uses room prices
- booking engine availability uses room status and occupancy
- housekeeping is tied to rooms

## 9. Demo Data Seed

Entry point:

- button on `/admin/rooms`
- backend endpoint: `/api/demo/seed`

Purpose:

- populate a new property quickly with sample operational data

What it creates:

- room categories
- rooms
- guest profiles
- bookings

Why it exists:

- speeds up demos
- makes AI, bookings, dashboard, marketing, and public booking pages usable immediately

Important behavior:

- it is idempotent
- running it again should update or preserve the seeded records instead of blindly duplicating them

## 10. Bookings

Route:

- `/admin/bookings`

Purpose:

- manage reservations from the operator side

What the user can do:

- view bookings
- create bookings manually
- link bookings to rooms
- store guest details
- track stay dates
- capture totals and payment status

How it works:

- frontend loads room inventory and bookings
- booking creation uses room and stay data
- total amount is calculated from base room pricing and number of nights in the UI, then persisted through the booking API

Why it matters:

- bookings influence occupancy
- bookings drive dashboard stats
- AI forecasting and risk analysis use booking history
- public booking page inserts rows into the same booking table

## 11. Guests

Route:

- `/admin/guests`

Purpose:

- maintain guest profiles separate from individual bookings

What the user can do:

- view guest profiles
- add guest profiles
- flag VIP guests
- store notes and tags

How it works:

- frontend reads `/api/guests`
- operator can create and update guest records
- guest data is joined with bookings by guest ID, email, or phone in backend logic

Why it matters:

- guest intelligence reads this data
- messaging segments use guest records
- VIP status affects audience segmentation

## 12. Housekeeping

Route:

- separate housekeeping API, surfaced through room operations

Purpose:

- track room readiness and cleaning state

What it manages:

- housekeeping status per room
- common states such as clean, dirty, or maintenance-related readiness

How it works:

- frontend loads housekeeping view data from `/api/housekeeping`
- room-level status updates go to `/api/housekeeping/<room_id>`

Why it matters:

- dashboard highlights dirty rooms
- operators can prioritize operational readiness before arrivals

## 13. Settings

Route:

- `/admin/settings`

Purpose:

- configure tenant-wide property details

What the user can manage:

- property name
- property slug
- currency
- timezone
- contact details
- address
- tax settings
- service charge settings
- room categories

What the page also exposes:

- the public booking URL
- the property slug guests use in `/book/:slug`

Why it matters:

- booking engine uses tax and service charge settings for quoting
- the public property page pulls contact information from settings
- slug controls the shareable public booking page URL

## 14. Public Booking Engine

Routes:

- `/book`
- `/book/:slug`

Purpose:

- allow guests to search availability and submit reservation requests without admin login

Public search flow:

1. guest opens `/book/:slug`
2. frontend calls `/public/properties/:slug`
3. optional query params are included:
   - `check_in`
   - `check_out`
   - `guests`
4. backend loads the property by slug
5. backend returns:
   - property details
   - matching rooms
   - pricing for the selected stay

How availability is calculated:

- only rooms with `status = available` are returned
- room must support the guest count
- room must not overlap with pending or confirmed bookings in the selected date range

How pricing is calculated:

- base price x nights
- plus extra guest fees above base occupancy
- plus GST if enabled
- plus service charge if enabled

What the guest can do:

- search by property slug
- pick dates
- set guest count
- review room options
- review stay total
- submit guest details
- create a reservation request

Reservation submission flow:

1. guest chooses a room
2. guest enters name, email, phone, and notes
3. frontend posts to `/public/properties/:slug/bookings`
4. backend validates:
   - required fields
   - valid dates
   - room exists
   - room is bookable
   - guest count does not exceed room capacity
   - minimum stay is satisfied
   - no overlapping booking exists
5. backend inserts a booking with:
   - `status = pending`
   - `payment_status = unpaid`
6. frontend shows a reservation confirmation card

Current limitation:

- this is a reservation-request flow, not a payment checkout flow
- no online payment provider is integrated yet

## 15. AI Layer Overview

Admin AI routes:

- `/admin/ai-copilot`
- `/admin/forecasting`
- `/admin/dynamic-pricing`
- `/admin/guest-intelligence`
- `/admin/sentiment`
- `/admin/booking-risk`

Backend AI routes:

- `/ai/copilot`
- `/ai/forecast`
- `/ai/pricing`
- `/ai/guest-intelligence`
- `/ai/sentiment`
- `/ai/booking-risk`
- `/ai/briefing`

How the AI backend works:

1. backend collects live property data from PostgreSQL
2. it builds a prompt from rooms, bookings, guests, and summary stats
3. it calls Bedrock in AWS
4. it tries the primary Anthropic model first
5. if Anthropic is blocked by account billing or marketplace entitlement, it retries a Nova fallback model
6. if a model returns invalid JSON, the backend often falls back to rule-based logic

This design matters:

- the AI features are tied to real tenant data
- most endpoints are resilient and still return structured output even if model output is malformed

### 15.1 AI Copilot

Route:

- `/admin/ai-copilot`

Purpose:

- answer free-form operational and revenue questions using live property data

How it works:

- frontend sends a chat-like message list to `/ai/copilot`
- backend extracts the most recent user question
- backend includes current:
  - occupancy
  - revenue
  - outstanding payments
  - dirty rooms
  - recent bookings
  - room inventory
- model returns a plain-language answer inside a chat response structure

Best use cases:

- ask for summaries
- ask operational questions
- ask demand and revenue questions

### 15.2 Daily Briefing

Entry point:

- dashboard briefing action

Purpose:

- produce a quick manager briefing for the current day

What it summarizes:

- arrivals
- departures
- occupancy
- revenue today
- dirty rooms
- outstanding payments
- recent booking context

### 15.3 Demand Forecasting

Route:

- `/admin/forecasting`

Purpose:

- estimate future occupancy and revenue

How it works:

- backend passes historical rooms and booking data to the AI model
- desired structured result includes:
  - monthly forecast
  - demand signals
  - recommendations
  - seasonal patterns

Fallback behavior:

- if the model does not provide usable JSON, backend generates a 6-month forecast using rule-based occupancy and revenue estimates

### 15.4 Dynamic Pricing

Route:

- `/admin/dynamic-pricing`

Purpose:

- recommend new prices for rooms based on occupancy and recent demand

How it works:

- backend optionally filters to a specific room
- it combines:
  - room inventory
  - recent bookings
  - current occupancy
- model is asked for:
  - pricing recommendations
  - revenue simulation
  - pricing strategy
  - insights

Fallback behavior:

- if the AI result is missing, backend generates deterministic recommendations
- high occupancy leads to price increases
- low occupancy leads to tactical discounts
- medium occupancy leads to mild increases

### 15.5 Guest Intelligence

Route:

- `/admin/guest-intelligence`

Purpose:

- score guests and identify loyalty, retention, and churn opportunities

How it works:

- backend gathers guests plus non-cancelled bookings
- it either asks the model for guest scores and segments or computes them directly
- fallback scoring uses:
  - lifetime value
  - total stays
  - average spend
  - churn risk

Outputs include:

- guest scores
- guest segments
- insights
- recommendations

### 15.6 Sentiment Analysis

Route:

- `/admin/sentiment`

Purpose:

- analyze review text for service quality and issue detection

How it works:

- frontend sends a list of reviews to `/ai/sentiment`
- if no reviews are entered, backend uses sample reviews
- AI is asked for structured analysis

Fallback behavior:

- backend uses simple positive and negative keyword matching
- it still produces:
  - per-review sentiment
  - overall sentiment
  - topic breakdown
  - critical alerts
  - improvement suggestions

### 15.7 Booking Risk

Route:

- `/admin/booking-risk`

Purpose:

- identify likely no-shows, cancellations, and overbooking risk

How it works:

- backend reads upcoming pending and confirmed bookings
- it reads room inventory
- it asks AI for structured risk output

Fallback behavior:

- backend calculates risk from rules such as:
  - unpaid or partial payment
  - missing phone or email
  - short lead time
  - booking still pending
- it also checks if bookings per date exceed room count

Outputs include:

- booking-level risk rows
- overbooking alerts
- risk summary
- recommendations

## 16. Messaging

Route:

- `/admin/messaging`

Purpose:

- manage message templates
- choose audiences
- log outreach activity

Important limitation:

- messaging currently logs outreach inside AIR BEE
- it does not send real external email or WhatsApp yet

Tabs:

- Compose
- Templates
- Activity

What the page loads:

- summary counts
- templates
- message logs
- audience segments
- guest audience

How templates work:

- templates are stored in `message_templates`
- if a property has no templates yet, starter templates are auto-created
- starter examples include:
  - pre-arrival email
  - WhatsApp reminder
  - win-back offer

Template fields:

- name
- channel
- subject
- content
- variables
- active status

How compose works:

1. user chooses a template or writes free text
2. user chooses channel:
   - email
   - WhatsApp
3. user chooses a segment
4. user can also add manual recipients
5. backend resolves recipients
6. variables are rendered into subject and content
7. one row per recipient is written to `message_logs`

Examples of supported variables:

- `{{guest_name}}`
- `{{property_name}}`
- `{{property_slug}}`
- `{{contact_email}}`
- `{{contact_phone}}`
- `{{next_check_in}}`
- `{{last_checkout}}`

What Activity shows:

- logged communication records with channel, recipient, source, and timestamp

## 17. Marketing

Route:

- `/admin/marketing`

Purpose:

- manage contacts
- define audience segments
- save campaign drafts
- launch campaigns into the shared outreach log

Important limitation:

- launching a campaign logs outreach activity
- it does not deliver through SES, Twilio, WhatsApp Cloud API, or any external provider yet

Tabs:

- Overview
- Segments
- Campaigns
- Contacts

### 17.1 Contacts

Purpose:

- store marketing leads that may not have bookings yet

Fields include:

- name
- email
- phone
- source
- email opt-in
- WhatsApp opt-in

Why this matters:

- campaigns can target manual marketing contacts in addition to real guests

### 17.2 Segments

AIR BEE has two types of segments:

- built-in segments
- custom segments

Built-in segments are computed automatically:

- all reachable guests
- VIP guests
- upcoming arrivals
- returning guests
- lapsed guests
- marketing contacts

Custom segments are created in the Marketing page and stored in `marketing_segments`.

Custom segment builder supports rules for:

- source
  - guest profiles
  - marketing contacts
  - both
- channel fit
  - any
  - email only
  - WhatsApp only
- VIP only
- opt-in only
- minimum bookings
- maximum bookings
- arriving within N days
- lapsed for N days
- tag matching
- keyword search
- marketing contact source

How segment evaluation works:

1. backend builds a candidate audience from guest profiles and marketing contacts
2. built-in segment rules are applied
3. custom segment rules are applied
4. recipients are deduplicated
5. frontend receives counts and sample names

Why this matters:

- the same segment system powers both Marketing and Messaging

### 17.3 Campaigns

Campaign flow:

1. user creates a draft
2. user chooses:
   - name
   - description
   - channel
   - audience segment
   - template
   - subject
   - content
3. draft is stored in `campaigns`
4. user launches the campaign
5. backend resolves recipients using the chosen segment
6. backend writes one message log per recipient
7. backend marks the campaign as sent

Campaign result tracking:

- number of logged messages
- draft vs sent state
- launch timestamp
- recent activity

## 18. How Messaging and Marketing Connect

Messaging and Marketing are intentionally linked.

They share:

- message templates
- audience resolution logic
- guest-derived segments
- custom segments
- outreach logging infrastructure

This means:

- a template created in Messaging can be used by a campaign in Marketing
- a custom segment created in Marketing is available in Messaging
- outreach logged from Marketing appears in the same message activity layer

## 19. Reports

Route:

- `/admin/reports`

Current state:

- placeholder only

What exists now:

- title and empty-state card

What does not exist yet:

- no reporting engine
- no export feature
- no advanced analytics module behind this page yet

When demonstrating the product, present this as planned, not complete.

## 20. CMS

Current state:

- component exists, but it is a placeholder and not a core live admin workflow

What it represents:

- future page builder and content management area

What does not exist yet:

- no drag-and-drop editor
- no SEO settings workflow
- no public content publishing workflow

When demonstrating the product, present this as planned, not complete.

## 21. Data Connections Across the Product

This is the most important concept in AIR BEE. The modules are not isolated.

### Rooms affect

- public booking engine availability
- booking creation choices
- pricing recommendations
- housekeeping
- dashboard counts

### Bookings affect

- occupancy
- revenue
- dashboard stats
- AI forecasting
- booking risk scoring
- guest history
- public room availability

### Guests affect

- guest intelligence
- VIP segmentation
- messaging audiences
- marketing segments

### Settings affect

- public booking page identity
- property slug
- taxes and service charge in pricing
- contact details on public pages

### Marketing and Messaging affect

- communication history
- reusable audience definitions
- campaign activity records

### AI features depend on

- rooms
- bookings
- guests
- tenant settings

Because of this, the strongest tutorial angle is to show the product as one connected system rather than a collection of independent pages.

## 22. Recommended Tutorial Flow

If you are recording a walkthrough, use this order:

1. Landing page
   - explain what AIR BEE is
2. Sign up or sign in
   - explain tenant-based property access
3. Dashboard
   - explain occupancy, revenue, briefing
4. Rooms
   - show inventory management
5. Load Demo Data
   - populate a realistic property quickly
6. Bookings
   - show admin-side reservation management
7. Guests
   - show guest profiles and VIP tagging
8. Settings
   - show slug and public booking URL
9. Public booking page
   - show guest availability search and reservation submission
10. AI suite
   - Copilot
   - Forecasting
   - Dynamic Pricing
   - Guest Intelligence
   - Sentiment
   - Booking Risk
11. Messaging
   - templates, segments, outreach logs
12. Marketing
   - contacts, custom segments, campaigns
13. Close with limitations
   - reports placeholder
   - CMS placeholder
   - no external messaging provider yet
   - no payment checkout yet

## 23. Current Feature Status Summary

### Implemented and working

- authentication with Cognito
- admin dashboard
- room management
- booking management
- guest management
- housekeeping API
- property settings
- public booking engine
- AI briefing
- AI copilot
- AI forecasting
- AI pricing
- AI guest intelligence
- AI sentiment
- AI booking risk
- messaging templates and logs
- marketing contacts
- built-in segments
- custom segment builder
- campaign drafts and launch logging
- demo data seed

### Present but not fully implemented

- reports
- CMS

### Not implemented yet

- real email delivery
- real WhatsApp delivery
- payment checkout
- advanced reports engine
- public website builder

## 24. Key Technical Notes for Accurate Demo Narration

- public booking requests create `pending` bookings, not paid bookings
- messaging and marketing log outreach; they do not send to external providers yet
- AI features use real tenant data and include backend fallbacks when model output is unusable
- the product is tenant-scoped, so every property works within its own isolated data context
- the public booking page is driven by the same room and booking data used in the admin dashboard

## 25. Short Tutorial Closing Script

AIR BEE is designed as a connected hotel operating system. Room inventory, bookings, guests, AI insights, and outreach workflows all feed into each other. The product already supports daily hotel operations, public reservation capture, and AI-guided decision-making. The next stage is to extend the connected foundation with external delivery channels, online payment, deeper reporting, and CMS-driven public site management.

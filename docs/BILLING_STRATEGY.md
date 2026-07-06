# Billing Strategy

## Purpose

This document defines the initial billing direction for ShiftFlow without implementing a payment provider yet.

Billing is not part of the first SaaS infrastructure MVP. The data model should be prepared so payments can be added later safely.

## Initial Plans

```text
STARTER
PRO
BUSINESS
MANUAL
```

## Starter

For small businesses.

Suggested limits:

- one workspace
- small employee count
- core scheduling
- absences
- basic exports

## Pro

For more active businesses.

Suggested additions:

- higher employee limit
- advanced exports
- more managers
- better reports
- priority support

## Business

For larger or multi-location customers.

Suggested additions:

- multiple locations later
- custom reports
- custom domain later
- premium support
- future integrations

## Manual

For pilots, special deals, internal testing, or customers managed outside automated billing.

## Subscription State

Recommended values:

```text
TRIAL
ACTIVE
PAST_DUE
CANCELLED
EXPIRED
MANUAL
```

## Tenant Fields

Tenant-level billing metadata may include:

```text
plan
status
trialEndsAt
subscriptionEndsAt
billingStatus
manualBillingNote
```

Do not store card details in Firestore.

## MVP Scope

Include:

- plan field
- trial end date
- subscription status field
- admin ability to change plan/status manually
- admin visibility of trial/expired/past due tenants

Defer:

- Stripe or other payment provider integration
- invoices
- automated dunning
- coupon codes
- tax handling
- self-service billing portal

## Admin Panel

The admin panel should eventually show:

- active subscriptions
- trials
- expired trials
- past due tenants
- plan distribution
- estimated MRR when payment data exists

## Safety

Billing status should control access through tenant lifecycle rules, not through UI hiding only.

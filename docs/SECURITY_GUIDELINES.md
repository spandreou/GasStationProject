# Security Guidelines

## Purpose

This document defines the minimum security requirements, principles, and standards that must be followed in every project.

Security is not an optional feature. It must be considered during architecture, development, testing, deployment, and maintenance.

---

# Core Principles

## 1. Never Trust User Input

All user-provided data must be considered untrusted.

Validate:

* Query parameters
* Request bodies
* Headers
* Uploaded files
* Cookies
* URL parameters

Always validate on the backend even if validation already exists on the frontend.

---

## 2. Deny By Default

Access should be denied unless explicitly allowed.

Examples:

* Endpoints require authentication by default.
* Administrative actions require authorization by default.
* Internal APIs are not publicly accessible unless explicitly configured.

---

## 3. Least Privilege Principle

Users, services, containers, databases, and applications must only have the permissions they absolutely need.

Avoid:

* Root access
* Administrator access
* Superuser database accounts
* Full filesystem access

---

## 4. Security Before Convenience

When security and convenience conflict, security takes priority.

---

# Authentication

## Password Storage

Passwords must never be stored in plain text.

Allowed algorithms:

* Argon2id (preferred)
* bcrypt

Passwords must be hashed before storage.

---

## Password Requirements

Minimum requirements:

* 12+ characters
* Uppercase letter
* Lowercase letter
* Number
* Special character

---

## Multi-Factor Authentication

When possible, support:

* TOTP
* Passkeys
* Hardware security keys

---

## Session Security

* Short-lived access tokens
* Refresh tokens stored securely
* Ability to revoke sessions
* Logout invalidates active sessions

---

# Authorization

## Role-Based Access Control

Every protected operation must verify permissions.

Example roles:

* Administrator
* Operator
* User
* Viewer

Never rely solely on frontend restrictions.

Authorization must always be verified on the backend.

---

# Database Security

## Prevent SQL Injection

Never build SQL queries through string concatenation.

Use:

* ORM frameworks
* Parameterized queries
* Prepared statements

User input must never directly become executable SQL.

---

## Database Accounts

Production applications must use dedicated database accounts.

Avoid:

* Root
* Superuser
* Administrative accounts

Grant only necessary permissions.

---

## Sensitive Data

Sensitive information should be encrypted before storage.

Examples:

* Government identifiers
* Personal identification numbers
* Financial information
* Access tokens
* Recovery codes

Recommended:

* AES-256-GCM

---

## Data Minimization

Store only the data that is required.

Do not collect information that is not needed.

---

# API Security

## Input Validation

Validate:

* Length
* Type
* Format
* Allowed values

Reject invalid requests immediately.

---

## Rate Limiting

Apply rate limits to:

* Login endpoints
* Registration endpoints
* Search endpoints
* Public APIs

Prevent abuse and brute-force attacks.

---

## Request Size Limits

Set maximum limits for:

* Request bodies
* File uploads
* Query length

Prevent denial-of-service attacks.

---

## API Versioning

Avoid breaking existing clients unexpectedly.

Use versioning when introducing incompatible changes.

---

# Logging and Monitoring

## Security Events

Log:

* Failed logins
* Permission violations
* Authentication failures
* Suspicious requests
* Rate limit violations

---

## Attack Detection

Monitor for:

* SQL injection attempts
* XSS attempts
* Command injection attempts
* Brute-force attacks
* Credential stuffing

Flag suspicious activity for review.

---

## Log Protection

Logs must not contain:

* Plain-text passwords
* Secret keys
* Tokens
* Sensitive personal information

---

# File Upload Security

## Allowed File Types

Use an allowlist approach.

Only permit explicitly approved file types.

---

## File Validation

Validate:

* Extension
* MIME type
* File size

Do not trust the filename alone.

---

## Dangerous File Types

Block executable files such as:

* exe
* bat
* cmd
* ps1
* sh
* apk

unless specifically required and reviewed.

---

# Secrets Management

## Secret Storage

Never store:

* Passwords
* API keys
* JWT secrets
* Database credentials

inside source code.

Use:

* Environment variables
* Secret managers
* Secure vaults

---

## Repository Protection

Secrets must never be committed to source control.

Use:

* .gitignore
* Secret scanning
* Pre-commit checks

---

# Transport Security

## HTTPS

All production traffic must use HTTPS.

Unencrypted communication is not permitted.

---

## Security Headers

Use appropriate security headers such as:

* HSTS
* X-Frame-Options
* X-Content-Type-Options
* Referrer-Policy
* Content-Security-Policy

---

# Frontend Security

## XSS Prevention

Never render untrusted HTML directly.

Escape user content.

Use framework protections whenever available.

---

## Content Security Policy

Implement CSP where possible.

Reduce the risk of script injection attacks.

---

# Backend Security

## Command Execution

Never execute commands using string concatenation.

Use:

* Safe APIs
* Process arguments
* Allowlists

User input must never become executable commands.

---

## Dependency Security

Dependencies must be:

* Maintained
* Updated
* Reviewed

Remove unused packages.

---

## Secure Defaults

New features should be secure by default.

Developers should not need to remember additional security steps.

---

# Infrastructure Security

## Backups

Create regular backups.

Backups should be:

* Tested
* Encrypted
* Stored securely

---

## Network Segmentation

Separate:

* Public services
* Internal services
* Databases
* Administrative systems

whenever possible.

---

## Firewall Rules

Allow only necessary traffic.

Block everything else.

---

# Auditing

The following actions should be auditable:

* User creation
* User deletion
* Permission changes
* Data exports
* Data deletion
* Security configuration changes

Audit records should be immutable whenever possible.

---

# Security Review Checklist

Before deployment verify:

* Authentication implemented
* Authorization verified
* Input validation completed
* Rate limiting enabled
* Secrets protected
* HTTPS enabled
* Sensitive data encrypted
* Logging configured
* Backups configured
* Dependencies updated
* Security testing completed

---

# Golden Rules

1. Never trust user input.
2. Validate everything.
3. Sanitize everything.
4. Encrypt sensitive data.
5. Log important events.
6. Use least privilege.
7. Keep dependencies updated.
8. Use secure defaults.
9. Deny by default.
10. Security is everyone's responsibility.

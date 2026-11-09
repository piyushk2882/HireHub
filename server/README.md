# HireHub Backend API Documentation

## Overview

HireHub backend is built with Node.js, Express, and MongoDB (Mongoose), utilizing HttpOnly JWT cookies for session security, double-submit cookie CSRF defense, role-based authorization (`job_seeker`, `recruiter`, `admin`), and isolated local/S3-compatible file storage.

---

## Authentication & Security Conventions

1. **Authentication:**
   - Transported via HttpOnly cookie: `hirehub_token`.
   - Never exposed to client-side JavaScript (`document.cookie` cannot read it).

2. **CSRF Protection:**
   - Double-submit cookie architecture.
   - Non-mutating requests (`GET`, `HEAD`, `OPTIONS`) receive a readable `XSRF-TOKEN` cookie.
   - State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require the `X-XSRF-TOKEN` header matching the `XSRF-TOKEN` cookie.

3. **Origin & CORS:**
   - Requests must originate from the authorized frontend origin (`http://localhost:4200` by default).

4. **Storage Security:**
   - Resumes are stored outside the public directory with sanitized unique UUID keys.
   - Binary signatures (magic numbers) and file extensions are verified.
   - Storage keys and filesystem paths are never leaked to clients.

---

## Candidate Application Management APIs (Phase 5A)

### 1. Submit Application
Submits a job application for an active job posting along with a cover letter and resume document.

- **Method & Path:** `POST /api/jobs/:jobId/applications`
- **Role:** `job_seeker` only
- **Content-Type:** `multipart/form-data`
- **CSRF Required:** Yes (`X-XSRF-TOKEN`)

#### Request Form Data:
| Field | Type | Required | Description |
|---|---|---|---|
| `resume` | File | Yes | Allowed extensions: `.pdf`, `.doc`, `.docx`. Max 5 MB. Verified binary signature. |
| `coverLetter` | String | No | Candidate cover letter text (maximum 5,000 characters). |

#### Sample Request (`curl`):
```bash
curl -X POST "http://localhost:5000/api/jobs/65f42c.../applications" \
  -H "Origin: http://localhost:4200" \
  -H "X-XSRF-TOKEN: <xsrf-token>" \
  -b "hirehub_token=<jwt-cookie>; XSRF-TOKEN=<xsrf-token>" \
  -F "coverLetter=I am an experienced Node.js developer interested in this role." \
  -F "resume=@/path/to/my_resume.pdf"
```

#### Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Application submitted successfully.",
  "data": {
    "application": {
      "_id": "6640abc...",
      "jobId": "65f42c...",
      "applicantId": "65e21a...",
      "resumeUrl": "/api/applications/6640abc.../resume",
      "resumeOriginalName": "my_resume.pdf",
      "resumeMimeType": "application/pdf",
      "resumeSize": 145020,
      "coverLetter": "I am an experienced Node.js developer interested in this role.",
      "status": "Pending",
      "appliedAt": "2026-11-06T14:00:00.000Z",
      "statusHistory": [
        {
          "status": "Pending",
          "changedBy": "65e21a...",
          "changedAt": "2026-11-06T14:00:00.000Z",
          "note": "Application submitted by candidate"
        }
      ],
      "createdAt": "2026-11-06T14:00:00.000Z",
      "updatedAt": "2026-11-06T14:00:00.000Z"
    }
  }
}
```

#### Error Responses:
- `400 Bad Request`: Job inactive/draft/closed/archived, candidate applying to their own job, missing resume, oversized file, invalid file format or corrupted signature.
- `401 Unauthorized`: Not authenticated.
- `403 Forbidden`: User is a `recruiter` or `admin`, or CSRF token mismatch.
- `404 Not Found`: Job does not exist.
- `409 Conflict`: Candidate has already submitted an application to this job.

---

### 2. Candidate Application History
Retrieves all applications submitted by the authenticated candidate.

- **Method & Path:** `GET /api/applications/my-applications`
- **Role:** `job_seeker` only
- **Query Parameters:**
  - `page` (integer, default `1`): Current page number.
  - `limit` (integer, default `10`, max `50`): Page size.
  - `status` (string, optional): Filter by status (`Pending`, `Reviewed`, `Shortlisted`, `Rejected`, `Accepted`).
  - `sort` (string, default `newest`): `newest` or `oldest`.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Applications retrieved successfully.",
  "data": {
    "applications": [
      {
        "_id": "6640abc...",
        "jobId": {
          "_id": "65f42c...",
          "title": "Senior Backend Engineer",
          "location": "Remote",
          "employmentType": "Full Time",
          "experienceLevel": "Senior",
          "salaryMin": 120000,
          "salaryMax": 160000,
          "category": "Development",
          "status": "Active",
          "companyId": {
            "_id": "65d89f...",
            "companyName": "TechCorp Global",
            "logo": "https://example.com/logo.png",
            "location": "San Francisco, CA"
          }
        },
        "applicantId": "65e21a...",
        "resumeUrl": "/api/applications/6640abc.../resume",
        "resumeOriginalName": "my_resume.pdf",
        "resumeMimeType": "application/pdf",
        "resumeSize": 145020,
        "coverLetter": "I am an experienced...",
        "status": "Pending",
        "appliedAt": "2026-11-06T14:00:00.000Z",
        "statusHistory": [...]
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### 3. Recruiter Job Applicant List
Retrieves all applicants who applied to a specific job owned by the authenticated recruiter (or all jobs for admin).

- **Method & Path:** `GET /api/jobs/:jobId/applications`
- **Role:** `recruiter` (must own the job) or `admin`
- **Query Parameters:**
  - `page` (integer, default `1`): Current page number.
  - `limit` (integer, default `10`, max `50`): Page size.
  - `status` (string, optional): Filter by status (`Pending`, `Reviewed`, `Shortlisted`, `Rejected`, `Accepted`).
  - `sort` (string, default `newest`): `newest` or `oldest`.

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "message": "Job applications retrieved successfully.",
  "data": {
    "job": {
      "_id": "65f42c...",
      "title": "Senior Backend Engineer",
      "status": "Active"
    },
    "applications": [
      {
        "_id": "6640abc...",
        "applicantId": {
          "_id": "65e21a...",
          "name": "Jane Candidate",
          "email": "jane@example.com",
          "phone": "+1-555-0199",
          "profileImage": "https://example.com/avatar.jpg"
        },
        "resumeUrl": "/api/applications/6640abc.../resume",
        "resumeOriginalName": "jane_resume.pdf",
        "resumeMimeType": "application/pdf",
        "resumeSize": 145020,
        "coverLetter": "Experienced backend developer...",
        "status": "Pending",
        "appliedAt": "2026-11-06T14:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

#### Authorization Rules:
- Returns `403 Forbidden` if another recruiter attempts to view applicants for a job they do not own.

---

### 4. Application Details
Retrieves detailed information for a single application.

- **Method & Path:** `GET /api/applications/:applicationId`
- **Role:** The candidate owner, the recruiter who owns the job, or an `admin`.
- **Response:** Fully populated job, company, safe candidate info, and complete status history audit log.

---

### 5. Secure Resume Download
Streams the applicant's resume file directly from secure backend storage.

- **Method & Path:** `GET /api/applications/:applicationId/resume`
- **Role:** The candidate owner, the recruiter who owns the job, or an `admin`.
- **Response Headers:**
  - `Content-Type`: MIME type of document (e.g. `application/pdf`)
  - `Content-Disposition`: `attachment; filename="sanitized_name.pdf"`
  - `Cache-Control`: `private, no-cache, no-store, must-revalidate`
- **Security:** Storage key is never shared; raw stream is piped directly with path traversal safeguards.

---

### 6. Update Application Status
Updates the status of an application and records an audit log entry.

- **Method & Path:** `PATCH /api/applications/:applicationId/status`
- **Role:** `recruiter` (must own the job) or `admin`
- **Content-Type:** `application/json`
- **CSRF Required:** Yes (`X-XSRF-TOKEN`)

#### Request Body:
```json
{
  "status": "Shortlisted",
  "note": "Passed preliminary resume screening."
}
```

#### Status Transition Rules:
| Current Status | Allowed Next Statuses (Recruiter) | Notes |
|---|---|---|
| `Pending` | `Reviewed`, `Shortlisted`, `Rejected` | Initial state on submission |
| `Reviewed` | `Shortlisted`, `Rejected`, `Accepted` | After recruiter review |
| `Shortlisted` | `Accepted`, `Rejected` | After interview cycle |
| `Accepted` | None | Terminal status (Admin override only) |
| `Rejected` | None | Terminal status (Admin override only) |

- **Duplicate Submissions:** If the same status is submitted again, the application record is returned without creating duplicate history entries.
- **Admin Privileges:** Admins may override terminal status restrictions if an application needs to be reopened.

---

## Notification Infrastructure & APIs (Phase 6A)

### 1. Overview & Architecture

Phase 6A introduces a resilient, asynchronous notification and email delivery system:
- **In-App Notifications:** Real-time readable notification entries stored in MongoDB.
- **Persistent Email Outbox Queue:** MongoDB-backed transactional outbox (`EmailOutbox`), avoiding reliance on external queue brokers like Redis/BullMQ.
- **Non-blocking Event Hook:** Status changes and new applications enqueue events without blocking or rolling back user operations.
- **Dedicated Background Worker:** Standalone worker process (`server/src/workers/email.worker.js`) that claims jobs using atomic MongoDB locking (`findOneAndUpdate`), handles exponential backoff retries, and reclaims stale jobs.

---

### 2. Supported Notification Event Types

| Event Type | Recipient Role | Trigger | Description |
|---|---|---|---|
| `NEW_APPLICATION` | Recruiter | Candidate submits application | Informs recruiter of new applicant for their posting |
| `APPLICATION_REVIEWED` | Candidate | Recruiter advances to "Reviewed" | Candidate application moved to under review |
| `APPLICATION_SHORTLISTED` | Candidate | Recruiter advances to "Shortlisted" | Candidate shortlisted for next round |
| `APPLICATION_REJECTED` | Candidate | Recruiter marks "Rejected" | Candidate informed of rejection with feedback |
| `APPLICATION_ACCEPTED` | Candidate | Recruiter marks "Accepted" | Candidate informed of job offer / acceptance |

---

### 3. Notification APIs

All notification endpoints require authentication via the `hirehub_token` HttpOnly cookie.

#### `GET /api/notifications`
Retrieves paginated notifications for the authenticated user, sorted newest first.

- **Query Parameters:**
  - `page` (number, default: `1`): Current page.
  - `limit` (number, default: `10`, max: `50`): Page size.
  - `unreadOnly` (boolean, default: `false`): Filter for unread notifications only (`?unreadOnly=true`).
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Notifications retrieved successfully.",
  "data": {
    "notifications": [
      {
        "_id": "6724fa...",
        "recipientId": "65e21a...",
        "type": "APPLICATION_SHORTLISTED",
        "title": "Application Shortlisted: Senior Fullstack Engineer",
        "message": "Your application for \"Senior Fullstack Engineer\" has been updated to \"Shortlisted\".",
        "relatedEntityType": "Application",
        "relatedEntityId": "6640ab...",
        "isRead": false,
        "readAt": null,
        "createdAt": "2026-11-06T14:30:00.000Z",
        "updatedAt": "2026-11-06T14:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

#### `GET /api/notifications/unread-count`
Retrieves the total count of unread notifications for badge rendering.

- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Unread count retrieved successfully.",
  "data": {
    "unreadCount": 3
  }
}
```

#### `PATCH /api/notifications/:id/read`
Marks a single notification as read. Enforces recipient ownership (returns `403 Forbidden` if accessed by another user).

- **CSRF Required:** Yes (`X-XSRF-TOKEN`)
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Notification marked as read.",
  "data": {
    "notification": {
      "_id": "6724fa...",
      "isRead": true,
      "readAt": "2026-11-06T14:35:00.000Z"
    }
  }
}
```

#### `PATCH /api/notifications/read-all`
Marks all unread notifications of the authenticated user as read in a single atomic bulk update.

- **CSRF Required:** Yes (`X-XSRF-TOKEN`)
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "All unread notifications marked as read.",
  "data": {
    "modifiedCount": 3
  }
}
```

#### `DELETE /api/notifications/:id`
Deletes a notification belonging to the authenticated user. Enforces recipient ownership.

- **CSRF Required:** Yes (`X-XSRF-TOKEN`)
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Notification deleted successfully."
}
```

#### `GET /api/notifications/preferences`
Retrieves the authenticated user's notification preferences with sensible defaults.

- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Notification preferences retrieved successfully.",
  "data": {
    "preferences": {
      "emailNotificationsEnabled": true,
      "applicationStatusEmails": true,
      "recruiterNewApplicationEmails": true
    }
  }
}
```

#### `PATCH /api/notifications/preferences`
Updates user email preferences. Only allowed boolean fields are accepted; invalid types or extra fields are rejected with `400 Bad Request`.

- **CSRF Required:** Yes (`X-XSRF-TOKEN`)
- **Request Body:**
```json
{
  "emailNotificationsEnabled": true,
  "applicationStatusEmails": false,
  "recruiterNewApplicationEmails": true
}
```

---

### 4. Background Email Worker & Persistent Outbox

The persistent queue stores jobs in MongoDB `emailoutboxes` collection:

#### Outbox Lifecycle Statuses:
- `Pending`: Ready to be claimed and delivered.
- `Processing`: Atomically locked by a worker (`lockedAt`, `lockedBy`, attempts incremented).
- `Sent`: Successfully delivered via Nodemailer (`sentAt` set).
- `Failed`: Exceeded `maxAttempts` (default 5) or SMTP permanently unconfigured.

#### Retry Policy & Exponential Backoff:
When temporary failures occur (e.g. SMTP connection timeout, rate limit):
- Next attempt delay: `min(1 hour, 5s * 2^(attempts - 1))`.
- Example sequence:
  - Attempt 1: retry in 5s
  - Attempt 2: retry in 10s
  - Attempt 3: retry in 20s
  - Attempt 4: retry in 40s
  - Attempt 5: permanently marked `Failed`.

#### Stale Job Recovery:
If a worker crashes while processing a job, jobs with `status: "Processing"` and `lockedAt <= 5 minutes ago` are automatically reclaimed by any active worker on the next polling cycle.

#### Concurrency & Atomic Locking:
Uses MongoDB atomic document locking:
```javascript
EmailOutbox.findOneAndUpdate(
  {
    $or: [
      { status: "Pending", nextAttemptAt: { $lte: new Date() } },
      { status: "Processing", lockedAt: { $lte: staleThreshold } }
    ]
  },
  {
    $set: { status: "Processing", lockedAt: new Date(), lockedBy: workerId },
    $inc: { attempts: 1 }
  },
  { returnDocument: "after", sort: { nextAttemptAt: 1 } }
);
```
Guarantees that multiple worker instances running concurrently will never process the same email job.

---

### 5. Running the API Server and Email Worker

#### Running API Server:
```bash
cd server
npm run dev     # Development with hot-reload
npm start       # Production
```

#### Running Email Worker:
```bash
cd server
npm run worker:email
```

#### Running Both in Development:
Run the API server in one terminal and the email worker in a second terminal.

#### Unconfigured SMTP Policy:
If `SMTP_HOST` is not set, in-app notifications continue to work seamlessly. When the email worker attempts to process an outbox job without SMTP configured, it logs an operational warning and sets `status: "Failed"` with `lastError: "SMTP transport is not configured"`. It never falsely marks unconfigured jobs as sent.

---

### 6. Phase 6B Frontend Integration Guidelines

Phase 6B will implement the Angular 21 Notification UI. It can integrate with Phase 6A as follows:

1. **Header Notification Bell Component:**
   - Call `GET /api/notifications/unread-count` on load and on a light polling interval (e.g. every 30s).
   - Display unread badge with counter.
2. **Notification Dropdown / Center:**
   - Call `GET /api/notifications?page=1&limit=10` to display recent notifications.
   - Click to read: call `PATCH /api/notifications/:id/read`.
   - "Mark all as read": call `PATCH /api/notifications/read-all`.
   - Delete item: call `DELETE /api/notifications/:id`.
3. **User Preferences Page:**
   - Call `GET /api/notifications/preferences` to bind switch toggles.
   - On change, send `PATCH /api/notifications/preferences`.



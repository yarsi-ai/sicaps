# SICAPS — Product Requirements Document (PRD)

## 1. Overview

**Product Name:** SICAPS (Smart AI System for Scabies Screening)  
**Version:** MVP (Phase 1)  
**By:** dr. Widjayanti — YARSI University  
**Date:** June 22, 2026

### 1.1 Product Description

SICAPS is a web-based chatbot that performs preliminary scabies screening through interactive conversation. The system receives voice or text input from users, extracts clinical keywords, calculates risk scores, understands patient disease perception, and provides output including risk conclusions, psychological responses, action recommendations, and personalized care advice.

### 1.2 Objectives

- Provide accessible preliminary scabies screening for santri (students) at pesantren (Islamic boarding schools)
- Facilitate health cadres in recording and monitoring santri health
- Provide education and care advice based on risk level
- Collect epidemiological data for research
- Connect screening results with doctors for clinical review

### 1.3 Target Users

| User | Description |
|------|-------------|
| Santri | Primary users who undergo screening (via cadre or independently) |
| Health Cadre | Field workers who input/record santri screenings |
| Doctor | Medical professionals who review screening results |
| Admin/Researcher | System administrators and research data collectors |
| General Public | Anyone who wants to do self-screening |

---

## 2. User Roles & Permissions

### 2.1 Admin
| Feature | Description |
|---------|-------------|
| Approve/Reject User | Manage Cadre and Doctor registrations |
| View All Data | Access all screening data |
| Export Data | Download CSV/Excel for research |
| Manage Users | Activate/deactivate accounts |

### 2.2 Doctor (Requires Admin Approval)
| Feature | Description |
|---------|-------------|
| Review Queue | View screenings with score ≥ 4 |
| Review Results | Confirm/correct AI diagnosis |
| Clinical Response | Structured input + free text + override suggestions |
| Referral | Direct patients to healthcare facilities |

### 2.3 Cadre (Requires Admin Approval)
| Feature | Description |
|---------|-------------|
| Manage Respondents | Add/edit respondent data (santri/participants) |
| Run Screening | Start screening session for respondents |
| View Results | View screening results + doctor responses |
| Hand Over Device | Give device to respondent when answering questions |

### 2.4 General User (Login Optional)
| Feature | Description |
|---------|-------------|
| Self-Screening | Fill demographics + run screening independently |
| History | View own screening history |
| Incognito Mode | Screening not saved to account history (see [AI_BOT_SPEC.md §14.3](./phase-1/AI_BOT_SPEC.md)) |

### 2.5 Anonymous (No Login)
| Feature | Description |
|---------|-------------|
| One-time Screening | Fill minimal demographics + screening |
| View Results | At end of session + shareable link |
| Local History | Stored in browser (localStorage, 30 days). Can review results & chat transcript. |
| Data Stored | For research purposes (with session UUID) |

---

## 3. Features & User Stories

### 3.1 Landing Page

**US-01:** As a visitor, I want to see an explanation of SICAPS so I understand its function.

**Acceptance Criteria:**
- Display title "SICAPS – Check Your Itch Symptoms with AI"
- Brief description: analyze symptoms, assess scabies risk, provide advice
- Disclaimer at start: "SICAPS is not a substitute for doctors. Screening results are educational."
- CTA buttons: "Start Screening" and "Login"
- Link to How to Use page
- "Screening History" button (secondary) — only shown if history data exists in localStorage

---

### 3.2 Authentication & Registration

**US-02:** As a user, I want to register and login according to my role.

**Acceptance Criteria:**
- Registration form with role selection: Cadre, Doctor, General User
- Login via email/password (Supabase Auth)
- Option "Continue without login" for anonymous
- Cadre & Doctor get "Pending Approval" status after registration
- Informative message if account not yet approved
- Redirect by role after login

---

### 3.3 Demographics Form

**US-03:** As a user/cadre, I want to fill respondent demographic data for research purposes.

**Acceptance Criteria:**

#### 3.3.1 Pre-chat Form (Filled by all users before screening)

| Field | Type | Notes |
|-------|------|-------|
| Name | Text | Optional |
| Age | Number | Years |
| Gender | Toggle | Male, Female |
| Education Level | Dropdown | Elementary, Junior High, Senior High, University |

- Only 1 step, minimal friction
- Education Level determines chat theme (Elementary → Playful, others → Hybrid)
- Habits and history data gathered by bot during chat (see [AI_BOT_SPEC.md §2.3](./phase-1/AI_BOT_SPEC.md))


#### 3.3.2 Cadre Grouping Form (Phase 2)

Location and institution data managed by Cadre in separate dashboard:

| Field | Type | Notes |
|-------|------|-------|
| Province | Dropdown | Cascading (Kemendagri data) |
| Regency/City | Dropdown | Filter by Province |
| District | Dropdown | Filter by Regency/City |
| Village | Dropdown | Filter by District |
| Pondok/Institution Name | Text | Optional |
| Residence Duration | Dropdown | <6 mo, 6-12 mo, 1-2 yr, >2 yr |
| Room Occupants | Number | — |

- This data is attached to cadre/pondok profile, not per screening session
- Used for regional grouping and statistics

---

### 3.4 Chat Screening

**US-04:** As a user, I want to interact with the chatbot to describe my symptoms via text or voice.

> **Full details:** See [AI_BOT_SPEC.md](./phase-1/AI_BOT_SPEC.md) for persona specification, conversation flow, keyword extraction, adaptive language, edge cases, and safety guardrails.

**Acceptance Criteria:**
- Bubble chat UI (WhatsApp-like)
- Input: text field + voice button (Web Speech API browser)
- Output: text bubble + voice output (Web Speech API TTS) — see [AI_BOT_SPEC.md §13](./phase-1/AI_BOT_SPEC.md)
- Voice mode toggle in input area (next to mic button 🎤): ON → auto-TTS + auto-STT (full-voice experience)
- Long-press AI bubble → play TTS for that bubble (on-demand)
- AI starts with static greeting (different per theme — see AI_BOT_SPEC §2.4)
- AI explores 6 scoring categories **adaptively** (not rigidly sequential):
  1. Itch intensity
  2. Time of occurrence
  3. Body location distribution
  4. Contact history
  5. Skin lesions
  6. Risk factors (incl. habits, scabies/treatment history)
- User perception **inferred** from conversation context (not separate question)
- Chat theme determined by education level: Elementary → Playful, others → Hybrid
- Follow-up max 1x per category if confidence is low. If still ambiguous → accept as `medium` confidence, include in scoring
- Chat input disabled after result displayed (no post-result interaction)

---

### 3.5 Keyword Extraction & Scoring (Backend)

**US-05:** As the system, I extract keywords and calculate risk scores accurately.

> **LLM & extraction architecture details:** See [AI_BOT_SPEC.md §3-4](./phase-1/AI_BOT_SPEC.md)

**Acceptance Criteria:**

**Flow:**
1. User responds → send to LLM (single call: respond + extract)
2. LLM extracts keywords per category + confidence score (high/medium/low) → return structured JSON
3. Backend normalize & match keywords to score table → calculate score per category
4. Backend update state → send instruction to LLM for next turn

**Scoring Rules:**
- Cumulative: all matching keywords summed
- Longest match priority: "very itchy" matches → "itchy" not counted again
- Unique: each unique keyword counted only 1x even if repeated
- Floor 0 per category: negative keywords reduce, but min score = 0
- Total final score also floors at 0
- Confidence `low` → keyword not included in scoring until confirmed
- Confidence `medium`/`high` → keyword included in scoring

**Keyword & Score Table:**

**Itch Intensity (score per pattern: 1):**
| Keyword | Score |
|---------|-------|
| very itchy, itchy, severe, very severe | 1 |
| can't stand it / unbearable | 1 |
| want to scratch constantly / keep scratching | 1 |
| disturbs sleep / wake up at night / can't sleep | 1 |
| until wounded / bleeding | 1 |
| stinging, somewhat itchy / slightly itchy, just a little | 0 |

**Timing (score per pattern: 2):**
| Keyword | Score |
|---------|-------|
| night / every night | 2 |
| worse at night | 2 |
| before sleep / midnight / wake up at night / dawn | 2 |
| Better during day/morning | 1 |
| all day / continuously | 1 |

**Location (score per pattern: 2):**
| Keyword | Score |
|---------|-------|
| between fingers / finger webs | 2 |
| genitals / scrotum / penis | 2 |
| fingers / wrist / armpit / navel / stomach / waist / buttocks / groin / inner thigh / chest | 1 |
| Whole body | 0 |

**Contact History (score per pattern: 2):**
| Keyword | Score |
|---------|-------|
| roommate / same room | 2 |
| housemate / pondok friend | 2 |
| many people itchy / itchy together / infected / contagious | 2 |
| same bed / same blanket | 2 |

**Skin Lesions (score per pattern: 2):**
| Keyword | Score |
|---------|-------|
| papules / small bumps | 2 |
| bumps / welts | 1 |
| redness / rash | 1 |
| scratches / wounds / scratch marks / scabs / pus | 1 |
| lines / tracks | 1 |
| like insect bites | 0 |
| dry skin / cracked skin | 0 |

**Risk Factors (score per pattern: 2):**
| Keyword | Score |
|---------|-------|
| pondok / dormitory | 2 |
| crowded room / many people / cramped | 2 |
| sharing clothes / borrowing clothes / sharing sarong / sharing towel | 2 |
| sharing bed | 2 |
| rarely change sheets / poor hygiene / rarely wash hands | 2 |

**Negative Keywords (all categories):**
| Keyword | Score |
|---------|-------|
| not itchy / no itching | -2 |
| only during day / not at night | -1 |
| alone / no one else | -2 |
| normal skin / no bumps | -2 |

**Total Score Interpretation:**
| Score | Level | Interpretation |
|-------|-------|----------------|
| ≥ 7 | High | Highly likely scabies |
| 4 – 6 | Moderate | Suspected scabies, needs further evaluation |
| ≤ 3 | Low | Unlikely scabies |


---

### 3.6 Disease Perception

**US-06:** As the system, I want to understand patient perception to provide appropriate responses.

> **Implementation details:** See [AI_BOT_SPEC.md §8.3](./phase-1/AI_BOT_SPEC.md)

User perception is **inferred from conversation context** (not explicit questions). LLM detects perception indicators from user statements throughout the chat.

**Perception Mapping:**
| Perception | Indicators | AI Response in Output |
|------------|------------|----------------------|
| Underestimate | "just normal itch", "no big deal", "will heal on its own" | "Even though it seems mild, this condition can spread to others." |
| Overestimate | "very scared", "is this dangerous", "paranoid" | "No need to worry too much, this condition is generally treatable." |
| Barrier | "embarrassed", "don't want to check", "no money" | "You can start with online consultation or the nearest healthcare facility." |
| Adequate | "want to get checked", "needs treatment" | "You already have the right understanding." |

---

### 3.7 Screening Result Output

**US-07:** As a user, I want to see clear and actionable screening results.

> **Output generation details:** See [AI_BOT_SPEC.md §8](./phase-1/AI_BOT_SPEC.md)

**4-Part Output:**

1. **Conclusion & Risk Level** (LLM-generated, based on total score)
2. **Perception Response** (LLM-generated, adaptive to inferred user perception)
3. **Action Recommendations** (LLM paraphrases from template per level — substance fixed):
   - High: See healthcare provider immediately, avoid sharing items
   - Moderate: Monitor, see provider if worsening, maintain hygiene
   - Low: Maintain skin hygiene, see provider if not improving
4. **Personalized Care Advice** (LLM-generated based on user response context)

**Display:**
- All users: Total score + risk level + breakdown per category + 4-part output
- Cadre/Doctor/Admin Dashboard (Phase 2): All above + full chat transcript
- Disclaimer on result card: "This is not a medical diagnosis. For proper treatment, consult a healthcare provider."
- If score ≥ 4: label "Healthcare consultation recommended" (MVP). Label "Awaiting doctor review" only active in Phase 2 when doctor system is available.
- Buttons: "Start New Screening" & "Back to Home"

---

### 3.8 Screening History (Phase 1 — Client-Side)

**US-08:** As an anonymous user, I want to view my screening history so I can check previous results without needing screenshots.

**Acceptance Criteria:**

| # | Criteria |
|---|----------|
| 1 | `/history` page displays list of **completed** screenings from localStorage |
| 2 | Each item shows: date, risk badge (color), total score, mode (AI/questionnaire) |
| 3 | "View Result" → navigates to result page |
| 4 | "View Chat" → navigates to chat page in read-only mode (hide input, scroll-only) |
| 5 | History auto-deleted after 30 days (auto-expire) |
| 6 | "Delete All History" button with confirmation dialog |
| 7 | Privacy note: "History is only stored on this device" |
| 8 | Landing page: "Screening History" button conditional (only shown if data exists in localStorage) |
| 9 | Empty state: Capi illustration + "No history yet" + CTA to start screening |
| 10 | localStorage only stores metadata (sessionId, shareToken, date, score, risk level, mode) — not chat content |
| 11 | Chat transcript can be reopened in read-only mode (no input, scroll-only) |

**Limitations & Design:**

| Aspect | Detail |
|--------|--------|
| Storage | Browser localStorage — data not sent to server |
| When saved | After screening **completed** (result received). Incomplete sessions not in history. |
| Security | Detail access requires sessionId + shareToken (double verification) |
| Expire | 30 days from screening date |
| Cross-device | Not supported — history only per device/browser |
| Incognito browser | History not stored (localStorage cleared when tab closes) |

**Phase 2 Upgrade:**

When user logs in, localStorage history migrates to server:
- Frontend sends sessionId + shareToken pairs to backend
- Backend verifies & links to userId
- `/history` page switches source: localStorage → API
- "Incognito Mode" feature (§2.4) = screening not linked to account
- **Resume incomplete sessions:** Display unfinished sessions with "Continue" button. If expired (>24 hours), handle gracefully: "Session expired, start new?"


---

### 3.9 Cadre Dashboard

**US-09:** As a cadre, I want to manage respondents and view screening results.

**Acceptance Criteria:**
- Respondent list: name, last screening date, status (not done/completed/pending review)
- "Add Respondent" button → demographics form
- Per respondent detail: screening results + detailed scores + doctor responses
- Filter/search respondents

---

### 3.10 Doctor Dashboard

**US-10:** As a doctor, I want to review screening results that need clinical attention.

**Acceptance Criteria:**
- Queue: list of screenings with score ≥ 4, sorted by most recent
- Per item displays: demographic data, chat responses, scores per category, AI output
- Review form:
  - Confirm/Correct risk level (dropdown)
  - Doctor notes (free text)
  - Override/add care suggestions
  - Action: Refer to healthcare facility / Education only / Other
- Status tracking: Pending → Reviewed
- AI suggestions that are overridden displayed as "Doctor Notes" to user/cadre

---

### 3.11 Admin Dashboard

**US-11:** As an admin, I want to manage users and access research data.

**Acceptance Criteria:**
- List of pending Cadres & Doctors → Approve/Reject buttons
- Export screening data to CSV (filter: date, region, risk level)
- Overview: total users, total screenings, breakdown by status

---

### 3.12 How to Use Page

**US-12:** As a user, I want a guide on how to use SICAPS.

**Acceptance Criteria:**
- Step-by-step usage instructions
- Explanation of SICAPS and its limitations
- Example conversation flow
- FAQ

---

## 4. Non-Functional Requirements

### 4.1 Performance
- AI chat response < 5 seconds
- Page load < 3 seconds (3G network)
- Voice-to-text latency < 2 seconds

### 4.2 Security
- Rate limiting on LLM endpoints
- Role-based access control (RBAC)
- Input validation & sanitization
- CSRF protection
- Medical data handled with privacy principles
- API keys not exposed to client

### 4.3 Accessibility
- Mobile-first responsive design (3 breakpoints: mobile < 640px, tablet 640-1024px, desktop > 1024px)
- Voice input (STT) as alternative to typing
- Voice output (TTS) as alternative to reading — Web Speech API, details in [AI_BOT_SPEC.md §13](./phase-1/AI_BOT_SPEC.md)
- Indonesian language (semi-informal)
- Minimum WCAG 2.1 AA
- Adaptive chat theme based on education level — see [DESIGN_SPEC.md](./phase-1/DESIGN_SPEC.md)
- PDF download of screening results (with YARSI header)
- Shareable result link

### 4.4 Reliability
- Graceful fallback if LLM unavailable
- Session recovery if connection lost
- Informative error handling

---

## 5. Development Phases

### Phase 1 — MVP (Minimal Scope)
- Simple landing page + disclaimer
- Anonymous only (no login/register)
- Demographics form
- Chat screening (bubble chat + voice input)
- Scoring engine (hybrid: LLM extract → backend calculates)
- Screening result output (4 parts + disclaimer)
- Data persisted to Supabase (for research)
- Bilingual support (Indonesian + English) — see [BILINGUAL_SPEC.md](./phase-1/BILINGUAL_SPEC.md)
- LLM via Hugging Face Inference API
- Deploy: Vercel (frontend + API) + Supabase (DB)

### Phase 2 — Auth & Roles
- Login/Register system (Supabase Auth)
- Roles: Admin, Doctor, Cadre, General User
- Admin approval for cadre/doctor
- Cadre Dashboard (manage respondents)
- Doctor Dashboard (review score ≥ 4)
- Admin Dashboard (approve + export)
- Image-based assessment (custom CV model) — see [IMAGE_ASSESSMENT_SPEC.md](./phase-2/IMAGE_ASSESSMENT_SPEC.md)

### Phase 3 — Enhancement
- Real-time statistics (risk distribution charts, regional tables)
- Interactive outbreak maps
- Email/push notifications for doctors when new screening arrives
- PWA (Progressive Web App) for offline access
- LLM migration to self-deployed server

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Screenings completed/week | ≥ 50 |
| Accuracy vs doctor diagnosis | ≥ 80% |
| Doctor response time | < 24 hours |
| User drop-off rate (start but don't finish) | < 20% |
| Regional coverage | ≥ 5 pondok |

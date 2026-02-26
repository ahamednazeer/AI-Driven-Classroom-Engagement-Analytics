# AI-Driven Classroom Engagement & Adaptive Teaching System

An advanced educational technology platform that leverages Artificial Intelligence to monitor student engagement in real-time, providing educators with actionable insights to optimize classroom dynamics and teaching strategies.

---

## Key Features

### 1. Smart Attendance & Face Recognition
*   **Biometric Verification**: Students register their faces during profile setup using face-recognition libraries.
*   **One-Click Attendance**: Uses AI to verify students during live sessions via webcam.
*   **Approval Workflow**: Administrative oversight for new face registrations to ensure integrity.

### 2. Real-time Engagement Analytics
*   **Vision-Based Monitoring**: Analyzes student focus and distractions during live sessions.
*   **Engagement Scoring**: Sophisticated algorithms compute engagement levels based on visual signals.
*   **Teacher Dashboard**: Real-time feedback for instructors on class focus levels.

### 3. Integrated Live Classes
*   **Jitsi Integration**: Seamless video conferencing powered by 8x8 (JaaS).
*   **Token-Based Security**: Secure, authenticated access to class rooms using Jitsi JWT.
*   **Session Management**: Create, schedule, and track live classroom sessions.

### 4. Comprehensive Admin Dashboard
*   **Teacher Effectiveness**: Analyze teaching impact across different sessions.
*   **Dropout Risk Analysis**: Identify students at risk based on historical engagement trends (distracted percentage over time).
*   **Departmental Insights**: Comparative analytics across different academic departments.

---

## System Architecture

### Backend Architecture (FastAPI)
The backend is built with a modular service-oriented architecture:
- **API Layer**: Handles HTTP requests, validation (Pydantic), and routing.
- **Service Layer**: Contains business logic for face recognition, analytics computation, and Jitsi token generation.
- **Data Access Layer**: Uses SQLAlchemy (Asyncio) for database interactions with PostgreSQL.

### Frontend Architecture (Next.js)
- **App Router**: Leverages Next.js 16's App Router for efficient layouts and nested routing.
- **Component-Driven**: Reusable UI components styled with Tailwind CSS and Phosphor Icons.
- **Role-Based Views**: Distinct interfaces for Administrators, Teachers, and Students.

---

## Database Schema Overview

The system uses a relational PostgreSQL database with the following core entities:

- **Users**: Central entity storing profiles, roles (Admin, Teacher, Student), and face embeddings.
- **Classrooms**: Management of classroom groups, linked to teachers and students.
- **ClassSessions**: Tracking of individual live sessions, including status (Started, Ended).
- **SessionSummaries**: Aggregated engagement data for each session, used for long-term analytics.
- **LoginTracks**: Security auditing for user login attempts and failure reasons.

---

## User Roles & Permissions

| Role | Permissions |
| :--- | :--- |
| **Admin** | Full system access, departmental analytics, face approval, user management. |
| **Teacher** | Session creation, real-time engagement monitoring, classroom management. |
| **Student** | Profile setup (face registration), attending live sessions, viewing personal analytics. |

---

## Tech Stack

### Backend
- **Framework**: FastAPI (Asynchronous)
- **ORM**: SQLAlchemy 2.0 (Asyncio)
- **Migrations**: Alembic
- **AI Libraries**: face-recognition, numpy, pillow
- **Security**: python-jose (JWT), bcrypt (Hashing)
- **Validation**: pydantic-settings

### Frontend
- **Framework**: Next.js 16 (React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Icons**: Phosphor Icons, Lucide React

---

## Getting Started

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
cp .env.example .env  # Configure your DATABASE_URL and Jitsi keys
alembic upgrade head
python run.py
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## Project Structure

```text
├── backend
│   ├── alembic          # Database migration history
│   ├── app
│   │   ├── api          # API route definitions
│   │   ├── models       # Database entity models
│   │   ├── services     # Core business logic
│   │   ├── schemas      # Data validation schemas
│   │   ├── middleware   # Authentication and RBAC
│   │   └── config.py    # Environment settings
│   └── run.py           # Application entry point
├── frontend
│   ├── src
│   │   ├── app          # Next.js pages and layouts
│   │   ├── components   # Shared UI components
│   │   └── services     # Frontend API clients
│   └── package.json     # Node.js dependencies
└── README.md
```

step1: .\venv\Scripts\Activate.ps1
step2: cd backend
step3: python run.py
step4: cd frontend
step5: docker-compose up 

---

## License

Distributed under the MIT License.

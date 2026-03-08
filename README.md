Gas Station Shift Manager
A robust weekly shift management application tailored for gas stations, featuring real-time synchronization via Firebase.

 Tech Stack
Frontend: React + Vite + Tailwind CSS

Drag and Drop: dnd-kit

Backend & Auth: Firebase Firestore + Firebase Authentication

State Management: Zustand store

UI/UX: Glassmorphism UI with animated Hyperspeed backgrounds, including Light/Dark mode support

 Key Features
Weekly Scheduling: Dynamic grid (Monday-Sunday) with support for multiple shift slots per day.

Smart Shifting: Preset shifts combined with manual custom shifts.

Validation: Built-in shift overlap and conflict detection.

Analytics: Real-time calculation of working hours per employee and weekly totals.

Data Export: Quick export options for WhatsApp, PDF, Excel, and Word.

Admin Suite: Secure login, profile management, and action undo functionality.

 Getting Started
Install dependencies:

Bash
npm install
Run in development mode:

Bash
npm run dev
 Environment Configuration (.env)
Create a .env file in the root directory and add your Firebase credentials using the Vite format:

Απόσπασμα κώδικα
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
VITE_ADMIN_EMAIL=your_admin_email
 Mobile-First Roadmap
Responsive Design: Full mobile UI optimization with a redesigned weekly grid for small screens.

Mobile Navigation: Implementation of bottom navigation/actions for rapid on-the-go shift management.

Touch Optimization: Enhancing drag-and-drop and touch interactions with improved haptic/visual feedback.

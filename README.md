# 🌿 SmartWaste: Smart Municipal Solid Waste Management & Fleet Route Optimization System

> **A real-time, IoT-driven urban solid waste telemetry and automated fleet dispatching platform designed for modern smart cities.**

[![Node.js Version](https://img.shields.io/badge/Node.js-v18%2B-brightgreen.svg)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%204.0-38B2AC.svg)](https://tailwindcss.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900.svg)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-Academic%20%2F%20MIT-emerald.svg)](#)

---

## 📋 Executive Overview

**SmartWaste** addresses urban waste management inefficiencies, overflowing public bins, delayed dispatches, unmonitored fuel consumption, and lack of citizen engagement. The platform integrates real-time IoT sensor telemetry, algorithmic route optimization (Nearest Neighbor with 2-opt pass), automated driver-vehicle dispatching, vehicle fuel efficiency analytics, and a citizen grievance resolution pipeline.

---

## 🎯 5 Core System Objectives & Features

| # | Objective | Architectural Implementation |
|---|---|---|
| **1** | **Real-Time Bin Monitoring & Telemetry** | Background IoT simulator streaming live fill percentages via **Socket.IO**. Bins exceeding **80% threshold** trigger pulsing red markers, admin alerts, and automatic collection requests. Interactive Leaflet maps with fill-level color coding. |
| **2** | **Algorithmic Route Optimization** | Batches up to 10 critical bins per route from a central municipal depot. Computes geodesic distances with the **Haversine formula**, constructs initial routes via **Nearest Neighbor heuristic**, and applies a **2-opt refinement pass** to eliminate polyline overlaps and minimize total transit distance. |
| **3** | **Automated Driver Dispatch & Driver Portal** | Automatically pairs generated routes with the first available driver and ready vehicle. Provides a dedicated mobile-friendly driver dashboard with turn-by-turn stop sequences, interactive routing maps, one-tap stop collection (auto-resetting bin fill to 5%), skip handling, and end-of-route fuel logging. |
| **4** | **Fuel Consumption & Fleet Analytics** | Interactive **Recharts** visualizations detailing vehicle mileage trends, total liters consumed, actual km/L vs. manufacturer rated mileage, cost-per-km metrics, and vehicle health badges alerting managers to engine deterioration (>15% mileage deviation). |
| **5** | **Citizen Grievance & Public Engagement** | Public citizen portal for lodging waste complaints with photographic evidence (uploaded via Multer), searchable bin selectors, live 3-stage resolution pipelines (Submitted → In Progress → Resolved), and a public nearby bin finder map. |

---

## 🏗️ Architecture & Technology Stack

```
SmartWaste Architecture
┌─────────────────────────────────────────────────────────────┐
│                       React 19 SPA                          │
│  (Tailwind CSS, Leaflet Maps, Recharts, Lucide Icons, Vite)  │
└──────────────┬───────────────────────────────▲──────────────┘
               │ HTTP REST API                 │ WebSocket
               │ (Axios / Fetch)               │ (Socket.IO)
┌──────────────▼───────────────────────────────┴──────────────┐
│                    Express.js Backend                       │
│  - Dual Persistence & Live Mongoose Sync Engine             │
│  - Algorithmic Optimization (Nearest Neighbor + 2-Opt)      │
│  - IoT Background Telemetry Simulator                       │
│  - Multer Photo Upload System                               │
└──────────────┬───────────────────────────────┬──────────────┘
               │ SQL (better-sqlite3)          │ Mongoose ODM
┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
│     SQLite Local Database   │ │       MongoDB Database      │
│ (Fast ACID engine & queries)│ │  (mongodb://127.0.0.1:27017 │
│                             │ │        /smartwaste)         │
└─────────────────────────────┘ └─────────────────────────────┘
```

### Frontend
- **Framework**: React 19 + Vite 6
- **Styling**: Tailwind CSS 4 with custom emerald/teal municipal themes, dark mode toggle, glassmorphism, and responsive slide-out navigation
- **Mapping**: Leaflet 1.9 & React-Leaflet with custom SVG divIcons, dynamic pulse animations, depot anchors, and numbered stops
- **Data Visualization**: Recharts (Line charts, Bar charts, Reference lines, Deviation analysis)
- **Icons & UI**: Lucide React, CSS keyframe micro-animations, accessible dialog modals, live connectivity badge

### Backend & Databases
- **Runtime**: Node.js (ES Modules)
- **Web Framework**: Express.js
- **Real-Time Engine**: Socket.IO for bi-directional live telemetry, instant notifications, and route state broadcasts
- **MongoDB Connection**: Formal Mongoose ODM models with automatic startup synchronization, live mutation persistence hooks, and CLI migration script (`mongodb://127.0.0.1:27017/smartwaste`)
- **SQLite Engine**: `better-sqlite3` for high-throughput in-process synchronous queries and transactional consistency
- **Image Storage**: Multer disk storage serving static evidence files under `/uploads`

---

## 📂 Repository Structure

```
CAD_PROJECT/
├── client/                     # Vite + React 19 Frontend
│   ├── public/                 # Static assets & icons
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── Header.jsx      # Notifications bell & role header
│   │   │   ├── Sidebar.jsx     # Navigation menu with mobile drawer
│   │   │   ├── Layout.jsx      # Base application layout wrapper
│   │   │   └── ...
│   │   ├── context/            # Global React Contexts
│   │   │   ├── AuthContext.jsx # JWT session & user state
│   │   │   └── SocketContext.jsx # WebSocket live stream provider
│   │   ├── pages/              # Application views
│   │   │   ├── Landing.jsx     # Public landing page with demo quick-logins
│   │   │   ├── Dashboard.jsx   # Admin operational command center
│   │   │   ├── Bins.jsx        # Bin telemetry grid & Leaflet map
│   │   │   ├── Routes.jsx      # Route generation & 2-opt visualizer
│   │   │   ├── Drivers.jsx     # Fleet driver management
│   │   │   ├── Vehicles.jsx    # Sanitation fleet inventory
│   │   │   ├── FuelAnalytics.jsx # Recharts consumption & health metrics
│   │   │   ├── Complaints.jsx  # Admin grievance resolution drawer
│   │   │   ├── driver/         # Dedicated Driver portal
│   │   │   │   ├── DriverRoutes.jsx
│   │   │   │   ├── DriverProfile.jsx
│   │   │   │   └── DriverNotifications.jsx
│   │   │   └── citizen/        # Citizen public portal
│   │   │       ├── ReportComplaint.jsx
│   │   │       ├── MyComplaints.jsx
│   │   │       └── NearbyBins.jsx
│   │   └── api.js              # Centralized API fetcher with token injection
│   └── package.json
│
├── server/                     # Express.js REST & Real-Time Backend
│   ├── src/
│   │   ├── config/             # System constants & Central Depot coordinates
│   │   ├── db/                 # SQLite setup & seed migrations
│   │   │   ├── index.js        # better-sqlite3 database connection
│   │   │   ├── schema.js       # DDL schema definitions & auto-migrations
│   │   │   └── seed.js         # Seed data (25 bins, vehicles, drivers, fuel logs)
│   │   ├── middleware/         # JWT verification & role authorization
│   │   ├── routes/             # REST resource routers
│   │   │   ├── auth.js         # Login, registration, profile
│   │   │   ├── bins.js         # Bin CRUD & live status
│   │   │   ├── requests.js     # Collection requests queue
│   │   │   ├── routes.js       # Nearest Neighbor + 2-opt route engine
│   │   │   ├── driver.js       # Driver stop execution & fuel logger
│   │   │   ├── complaints.js   # Citizen complaints & photo upload
│   │   │   ├── fuelLogs.js     # Fuel log CRUD & efficiency calculation
│   │   │   └── notifications.js# System alerts & read state
│   │   ├── services/
│   │   │   └── simulator.js    # IoT telemetry background generator
│   │   └── index.js            # Express & Socket.IO server entrypoint
│   ├── scripts/
│   │   └── test_e2e_lifecycle.js # 13-stage automated verification suite
│   ├── uploads/                # Citizen complaint uploaded images
│   └── package.json
├── README.md                   # System documentation & viva guide
└── package.json                # Monorepo orchestration scripts
```

---

## ⚡ Quick Start Guide

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher

### 1. Installation
Clone the repository and install dependencies across root, server, and client:

```bash
# In project root
npm run install:all
```

*(Or manually run `npm install` inside both `server/` and `client/`)*

### 2. Seed Database
Initialize SQLite tables and populate 25 real Bangalore coordinates, drivers, vehicles, and 6 months of historical fuel records:

```bash
cd server
node src/db/seed.js
npm run mongo:sync
cd ..
```

*(Note: The server also performs an automatic full sync to MongoDB on bootup).*

### 3. Run Development Servers
Start both backend (Express on port `5000`) and frontend (Vite on port `5173`) concurrently:

```bash
npm run dev
```

Open your browser to:
**`http://localhost:5173`**

---

## 🔑 Pre-Seeded Demo Credentials

All test accounts share the default password: **`password123`**

| Role | Email | Password | Access Capabilities |
|---|---|---|---|
| **Administrator** | `admin@smartwaste.gov` | `password123` | Full access: Real-time telemetry, Route optimizer, Driver & Vehicle fleet assignment, Fuel analytics, Complaint dispatching. |
| **Field Driver** | `driver1@smartwaste.gov` | `password123` | Driver portal: Assigned routes, interactive map, stop collection, bin reset, fuel logging. |
| **Field Driver 2** | `driver2@smartwaste.gov` | `password123` | Secondary driver profile. |
| **Citizen** | `citizen1@gmail.com` | `password123` | Public portal: Photo complaint filing, 3-stage status timeline, nearby bins finder. |
| **Citizen 2** | `citizen2@gmail.com` | `password123` | Secondary citizen profile. |

> **Tip:** You can also click the quick-login demo chips directly on the public **Landing Page** (`/landing` or `/`) to log in with one click without typing!

---

## 🔄 Complete 10-Step Lifecycle Verification

You can verify the entire closed-loop lifecycle automatically at any time using the automated test suite:

```bash
node server/scripts/test_e2e_lifecycle.js
```

### Lifecycle Walkthrough:
1. **Citizen Registers**: Signs up via `/register` or API.
2. **Citizen Reports Overflowing Bin**: Takes photo evidence, selects target bin from dropdown or map, submits ticket.
3. **Admin Converts to Urgent Request**: Admin inspects report in detail drawer, clicks "Dispatch Urgent Request" — automatically queues priority request and marks complaint `in_progress`.
4. **IoT Telemetry Trigger**: Background simulator increases fill levels. Bins crossing 80% emit WebSocket alerts.
5. **Route Optimization**: Admin navigates to `/routes`, clicks "Generate Optimized Route". Algorithm groups critical bins, runs Nearest Neighbor from municipal depot, and performs 2-opt pass.
6. **Auto-Assignment**: System finds available driver + vehicle and pairs them; driver receives real-time notification.
7. **Driver Starts Route**: Driver logs in at `/driver/routes`, taps "Start Route" (sets vehicle to `on_route`).
8. **Driver Collects Stops**: Driver navigates to each stop and taps "Collected". Target bin fill immediately resets to **5%**, last emptied timestamp updates, and linked collection request completes.
9. **Route Completion & Fuel Logging**: Driver finishes all stops, enters final odometer and liters filled. Route completes; driver and vehicle return to `available`.
10. **Complaint Resolved**: Admin enters resolution note ("Sanitation crew completed collection on Route #X. Bin cleared."); citizen receives notification with updated 3-stage timeline.

---

## 🎓 Viva & Presentation Talking Points

### 1. Why SQLite with `better-sqlite3` instead of MongoDB or MySQL?
> *"For municipal edge deployments and operational reliability, `better-sqlite3` runs synchronously in-process, eliminating network hops and serialization latency. It delivers sub-millisecond execution times for spatial bounding queries and supports ACID transactions for atomic multi-table state transitions (e.g. marking a stop collected, resetting bin capacity, completing collection requests, and releasing drivers in a single atomic transaction)."*

### 2. How does the Route Optimization Algorithm work?
> *"The Traveling Salesperson Problem (TSP) is NP-hard. With municipal trucks collecting up to 10 stops per trip, exact factorial search ($10! = 3.62 \times 10^6$ combinations) is computationally expensive. We implement a 2-stage hybrid approach:*
> 1. * **Nearest Neighbor Heuristic**: Constructs an initial greedy tour in $O(N^2)$ starting from the fixed municipal depot using geodesic Haversine distance.*
> 2. * **2-Opt Local Search Refinement**: Iteratively evaluates all non-adjacent edge pairs $(i, j)$ and reverses sub-tours whenever reversing reduces total path length. This untangles crossing paths and produces near-optimal routing with sub-5ms latency."*

### 3. How does the IoT Telemetry Simulator operate?
> *"In production, ultrasonic distance sensors (e.g., HC-SR04 or laser ToF) mounted inside bin lids transmit fill percentages over MQTT/HTTP. Our simulator models realistic municipal fill rates with Gaussian noise, accelerates time for demonstration, and broadcasts telemetry over Socket.IO rooms to keep dashboard maps synced with zero browser reloads."*

### 4. How is Fleet Fuel Efficiency Evaluated?
> *"The system tracks actual mileage by computing $\Delta \text{odometer} / \text{liters filled}$ across consecutive fuel logs, then compares it against the manufacturer's rated average mileage (`avg_mileage_kmpl`). If a vehicle consumes >15% more fuel than expected, the system flags a red Alert badge on the Vehicle Health table, alerting managers to mechanical issues, fuel pilferage, or tire pressure degradation."*

---

## 📄 License
Academic and municipal evaluation project. Developed for advanced computer applications and smart municipal engineering demonstration.

# Smart Waste Collection & Optimization System
## Phase-by-Phase Prompts for Antigravity

**How to use this guide:** Paste ONE phase prompt at a time into Antigravity. Let it finish, test the result in the browser, fix any errors (just tell Antigravity the error), then move to the next phase. Do not paste all phases at once.

---

## PHASE 0 — Project Setup & Foundation

```
Create a full-stack web application called "SmartWaste - Waste Collection & Optimization System".

Tech stack:
- Frontend: React (Vite) + Tailwind CSS + React Router
- Backend: Node.js + Express
- Database: SQLite (using better-sqlite3) so it runs locally with zero configuration
- Maps: Leaflet with OpenStreetMap (free, no API key needed)
- Charts: Recharts

Set up the project as a monorepo with two folders: /client and /server.
- Configure the Express server on port 5000 with CORS enabled and a /api/health endpoint.
- Configure the Vite dev server on port 5173 with a proxy so all /api requests go to the backend.
- Add a root package.json with a single "npm run dev" script that starts both client and server concurrently.
- Create a clean, modern layout shell in React: a left sidebar with navigation links (Dashboard, Bins, Routes, Drivers, Vehicles, Fuel Analytics, Complaints), a top header, and a main content area. Use a green/teal environmental color theme.
- Add placeholder pages for each nav item.

Run the app and confirm both servers start without errors.
```

---

## PHASE 1 — Database Schema & Seed Data

```
Design and create the complete SQLite database schema for the waste management system. Create these tables:

1. users — id, name, email, password_hash, role ('admin' | 'driver' | 'citizen'), phone, created_at
2. bins — id, bin_code, location_name, latitude, longitude, capacity_liters, current_fill_percent, status ('active' | 'damaged' | 'inactive'), last_emptied_at, updated_at
3. vehicles — id, plate_number, model, fuel_type, tank_capacity, avg_mileage_kmpl, status ('available' | 'on_route' | 'maintenance')
4. drivers — id, user_id (FK to users), license_number, assigned_vehicle_id (FK to vehicles), availability ('available' | 'busy' | 'off_duty')
5. collection_requests — id, bin_id (FK), created_at, priority ('normal' | 'high' | 'urgent'), status ('pending' | 'assigned' | 'in_progress' | 'completed'), completed_at
6. routes — id, name, driver_id (FK), vehicle_id (FK), status ('planned' | 'in_progress' | 'completed'), total_distance_km, created_at, completed_at
7. route_stops — id, route_id (FK), bin_id (FK), stop_order, status ('pending' | 'collected' | 'skipped'), collected_at
8. fuel_logs — id, vehicle_id (FK), route_id (FK nullable), liters_filled, cost, odometer_km, log_date
9. complaints — id, citizen_id (FK to users), bin_id (FK nullable), type ('overflowing_bin' | 'damaged_bin' | 'missed_collection' | 'other'), description, photo_url (nullable), status ('open' | 'in_progress' | 'resolved'), created_at, resolved_at
10. notifications — id, user_id (FK), title, message, type, is_read, created_at

Then create a seed script (npm run seed) that inserts realistic demo data:
- 1 admin, 5 drivers, 3 citizens (all with password "password123")
- 25 bins spread across a city (use coordinates around a real city center, e.g., Bengaluru 12.9716, 77.5946) with varied fill levels from 10% to 98%
- 5 vehicles with different mileage values
- 10 historical fuel logs per vehicle over the past 3 months
- 8 sample complaints of mixed types and statuses
- A few completed historical routes with stops

Also build the basic REST API endpoints: GET/POST/PUT/DELETE for bins, vehicles, drivers, and complaints. Test each endpoint works.
```

---

## PHASE 2 — Authentication & Role-Based Access

```
Implement authentication and role-based access control:

- POST /api/auth/register (citizens only can self-register) and POST /api/auth/login using JWT tokens and bcrypt password hashing.
- Middleware to protect API routes and check roles (admin, driver, citizen).
- Frontend: Login page and Citizen Registration page with form validation and error messages.
- Store the JWT in localStorage, add an axios/fetch interceptor to attach it to requests, and redirect to login on 401.
- Role-based UI:
  * Admin sees the full sidebar (Dashboard, Bins, Routes, Drivers, Vehicles, Fuel Analytics, Complaints).
  * Driver sees only: My Routes, My Profile, Notifications.
  * Citizen sees only: Report Complaint, My Complaints, Nearby Bins.
- Add a logout button and show the logged-in user's name and role in the header.

Test login with the seeded admin, driver, and citizen accounts and verify each sees the correct navigation.
```

---

## PHASE 3 — Real-Time Bin Monitoring (Objective 1)

```
Build the real-time bin monitoring module:

1. Bins page (admin):
   - Interactive Leaflet map showing all bins as color-coded markers: green (<50% full), orange (50–79%), red (80%+), grey (damaged/inactive).
   - Clicking a marker shows a popup with bin code, location, fill %, last emptied date.
   - Below the map, a searchable/filterable table of all bins with fill-level progress bars. Filters: status, fill level range.
   - Add/Edit/Delete bin modal forms.

2. IoT sensor simulator:
   - Create a background job on the server (setInterval every 15 seconds) that simulates sensors: randomly increases the fill_percent of a few random active bins by 2–10%.
   - Expose GET /api/bins/live for the latest data.

3. Real-time updates:
   - Add Socket.IO to server and client. When a bin's fill level changes, emit a "bin:updated" event so the map and table update live without refreshing.
   - When any bin crosses 80%, emit a "bin:alert" event and show a toast notification in the admin UI.

4. Dashboard page:
   - Summary cards: Total Bins, Bins ≥80% Full, Active Collection Requests, Open Complaints, Available Drivers.
   - A small live-updating list of "Critical Bins" (fill ≥ 80%).

Verify the map markers change color live as the simulator runs.
```

---

## PHASE 4 — Automatic Collection Requests

```
Implement automatic collection request creation:

- In the sensor simulator job, whenever a bin's fill level crosses 80% and there is no existing pending/assigned collection_request for that bin, automatically insert a new collection_request.
  * Priority rules: 80–89% = normal, 90–95% = high, >95% = urgent.
- When a request is created, also insert a notification for all admin users ("Bin B-014 at MG Road is 92% full — collection request created") and emit it over Socket.IO.
- Build a "Collection Requests" section on the admin Dashboard or Bins page:
  * Table with bin code, location, fill %, priority badge (color-coded), status, created time.
  * Sort by priority then time. Allow manual creation and cancellation of requests.
- When a request is completed later (via routes), set the bin's fill level back to 5% and update last_emptied_at.

Test: watch the simulator push a bin past 80% and confirm the request + notification appear automatically.
```

---

## PHASE 5 — Route Optimization (Objective 2)

```
Build the route optimization module:

1. "Generate Optimized Route" flow (admin, on the Routes page):
   - Admin clicks "Generate Route". The system takes all pending collection requests, and groups up to 10 bins per route.
   - Implement route optimization on the server using the Nearest Neighbor algorithm with a 2-opt improvement pass, using the haversine formula for distances between bin coordinates. Start point is a fixed depot location (add a depot lat/lng in config, show it on maps with a special marker).
   - Save the route and ordered route_stops, and compute total_distance_km.

2. Route visualization:
   - Routes page shows a list of routes (planned / in-progress / completed) with distance, stop count, assigned driver.
   - Clicking a route opens a detail view: Leaflet map with the depot, numbered stop markers in visit order, and a polyline connecting them; plus an ordered stop list with each bin's fill level.

3. Show the estimated fuel needed for the route based on the assigned vehicle's avg_mileage_kmpl (distance / mileage).

Test by generating a route from the pending requests and verifying the stop order looks sensible on the map (no wild zig-zags).
```

---

## PHASE 6 — Automated Driver Assignment & Driver Portal (Objective 3)

```
Implement automated driver assignment and the driver-facing portal:

1. Auto-assignment:
   - When a route is generated, automatically assign the first driver whose availability = 'available' and who has an assigned vehicle with status 'available'. Set driver to 'busy', vehicle to 'on_route', route to 'planned', and linked collection_requests to 'assigned'.
   - If no driver is available, leave the route unassigned and notify admins. Provide a manual "Assign Driver" dropdown as fallback.
   - Send the assigned driver a notification ("New route assigned: 8 stops, 12.4 km") via Socket.IO and the notifications table.

2. Driver portal (role = driver):
   - "My Routes" page: current assigned route with the map, ordered stops, and a "Start Route" button.
   - Once started, the driver can mark each stop "Collected" or "Skipped" (with a reason). Marking collected sets the bin fill to 5%, updates last_emptied_at, and completes that collection_request.
   - When all stops are done, driver taps "Complete Route": route → completed, driver → available, vehicle → available, and a prompt appears asking the driver to log fuel used (liters + odometer) which saves to fuel_logs linked to the route.
   - Admin Routes page updates live via Socket.IO as the driver progresses.

Test the full flow: bin fills up → request auto-created → route generated → driver auto-assigned → driver completes stops → bin resets → route completed.
```

---

## PHASE 7 — Fuel Analytics (Objective 4)

```
Build the Fuel Analytics page (admin):

1. Fuel log management: table of all fuel_logs (vehicle, date, liters, cost, odometer, linked route) with add/edit/delete.

2. Analytics with Recharts:
   - Line chart: monthly fuel cost trend (last 6 months), one line per vehicle.
   - Bar chart: total liters consumed per vehicle.
   - Efficiency chart: actual km/l per vehicle computed from odometer differences between consecutive logs vs. the vehicle's rated avg_mileage_kmpl — highlight vehicles performing >15% worse than rated in red.
   - Cost-per-route metric: for routes with a linked fuel log, show fuel cost per km.

3. Summary cards: Total fuel cost this month, Total liters this month, Most efficient vehicle, Least efficient vehicle.

4. A "Vehicle Health" table listing each vehicle with rated mileage, actual mileage, deviation %, and a status badge (Good / Check / Alert).

Use the seeded historical fuel data so the charts render immediately.
```

---

## PHASE 8 — Citizen Complaint Management (Objective 5)

```
Build the complaint management module:

1. Citizen side:
   - "Report Complaint" page: form with complaint type (Overflowing Bin / Damaged Bin / Missed Collection / Other), an optional bin selector (searchable dropdown of nearby bins, or pick from a small map), description textarea, and optional photo upload (store in /server/uploads, serve statically).
   - "My Complaints" page: list of the citizen's complaints with status badges and a timeline (submitted → in progress → resolved).
   - "Nearby Bins" page: read-only map of bins with fill levels so citizens can find the nearest available bin.

2. Admin side:
   - Complaints page: table with filters (type, status, date), photo preview, and detail drawer.
   - Admin can change status (open → in_progress → resolved) and add a resolution note.
   - If a complaint type is "overflowing_bin" and linked to a bin, add a one-click "Create Collection Request" button that creates an urgent request for that bin.
   - If type is "damaged_bin", one-click button to set the bin status to 'damaged'.

3. Notifications: citizen gets notified when their complaint status changes; admins get notified when a new complaint arrives (Socket.IO + notifications table).

4. Add a notifications bell icon in the header for all roles showing unread count and a dropdown list, with mark-as-read.
```

---

## PHASE 9 — Landing Page, Polish & Final Testing

```
Finish the application:

1. Public landing page (before login): hero section explaining SmartWaste with the 5 key features (Real-time Bin Monitoring, Optimized Routes, Automated Driver Assignment, Fuel Analytics, Citizen Complaints), stats section, and Login / Register buttons. Modern design consistent with the green/teal theme.

2. Polish:
   - Loading spinners and empty states on every page.
   - Toast notifications for all success/error actions.
   - Confirm dialogs for deletes.
   - Responsive design: sidebar collapses to a hamburger menu on mobile; driver portal must be fully mobile-friendly.
   - Consistent date formatting and badge colors across the app.

3. Admin Dashboard upgrade: add a mini map of critical bins, a "Today's Activity" feed (requests created, routes completed, complaints filed), and quick-action buttons.

4. End-to-end test of the complete workflow and fix anything broken:
   citizen registers → reports overflowing bin → admin converts to request → simulator pushes other bins past 80% (auto-requests) → generate optimized route → driver auto-assigned → driver completes route + logs fuel → fuel analytics update → complaint resolved → citizen notified.

5. Write a README.md with project overview, features mapped to the 5 objectives, tech stack, setup instructions (npm install, npm run seed, npm run dev), demo credentials, and screenshots placeholders.
```

---

## Optional PHASE 10 — Extras (if time permits)

```
Add these enhancements to SmartWaste:

1. PDF report export: monthly summary report (collections completed, fuel cost, complaints resolved) downloadable from the admin dashboard.
2. Predictive fill estimation: using each bin's historical fill rate from the simulator, show "estimated hours until full" on the bin table.
3. Dark mode toggle.
4. Analytics page: collections per day chart, average request-to-completion time, complaint resolution time.
5. Basic unit tests for the route optimization algorithm (verify nearest-neighbor ordering and distance calculation).
```

---

## Tips for Working in Antigravity

1. **One phase at a time.** Let the agent finish, then verify in the browser before continuing.
2. **When something breaks**, paste the exact error message and say: "Fix this error: [error]". Don't re-paste the whole phase.
3. **Commit after each phase** (ask Antigravity: "initialize git and commit this phase with message 'Phase X complete'") so you can roll back.
4. **If the agent drifts**, remind it: "Stay within the existing project structure in /client and /server, reuse the existing database and components."
5. **For your viva/demo**, Phase 9's end-to-end workflow is your demo script — practice that exact sequence.

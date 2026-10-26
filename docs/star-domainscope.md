Domain change: replace e-commerce with resource booking (rooms and equipment).

Entities

users: same as before (bcrypt, roles customer / admin).
resources: id, name, type (room or equipment), capacity (nullable), active.
bookings: id, user_id, resource_id, during (tstzrange), status (CONFIRMED / CANCELLED), created_at.
Drop products, orders, and order_items. No cart, no pricing, no stock.

Star endpoint: POST /api/bookings

Body: resource_id, start, end. Validate that end > start, the booking is in the future, and the duration is within a sane maximum.
Insert inside a transaction. Overlaps are prevented by the database, not only by application logic:
CREATE EXTENSION btree_gist;
EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (status = 'CONFIRMED')
On exclusion violation (Postgres error 23P01), return 409 Conflict. Cancelled bookings must not block new ones.
Use plain pg with parameterized queries, no ORM, and node-pg-migrate for migrations.

Supporting endpoints

POST /api/auth/register and POST /api/auth/login (JWT).
Admin CRUD for resources.
GET /api/resources/:id/availability?from=&to= returns booked ranges.
GET /api/bookings returns the logged-in user’s bookings.
DELETE /api/bookings/:id cancels, and only the owner or an admin may do it.

Tests (Jest)

Fire many parallel bookings for the same resource and overlapping time. Assert that exactly one succeeds and the rest return 409.
Adjacent ranges (one ends when the next starts) must both succeed.
Booking after a cancellation of the same slot must succeed.

Keep unchanged

GET /health runs SELECT 1 and returns {"status":"ok","database":"ok"}.
GET /metrics serves default process stats and HTTP histograms/counters.
Add business counters: bookings_created_total and booking_conflicts_total.
Env-based config, logs to stdout, .env.example present, no secrets in the repo.

Frontend (minimal)

Resource list, availability view, booking form, and “my bookings”. No calendar polish.
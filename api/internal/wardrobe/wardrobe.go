package wardrobe

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"
)

type Handler struct{ Pool *pgxpool.Pool }
type fault struct {
	status int
	code   string
}

func (e fault) Error() string    { return e.code }
func conflict(code string) error { return fault{409, code} }

// Alphabetic prefixes keep physical labels unambiguous even above slot 999:
// numeric suffixes would make A/1001 and A1/001 both look like A1001.
var prefixPattern = regexp.MustCompile(`^[A-Z]{1,8}$`)
var profilePattern = regexp.MustCompile(`(?i)^(?:glow|pulse)://friend/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$`)

type Items struct {
	Coat     int `json:"coat"`
	Bag      int `json:"bag"`
	Backpack int `json:"backpack"`
}

func (i Items) total() int { return i.Coat + i.Bag + i.Backpack }
func (i Items) valid() bool {
	return i.Coat >= 0 && i.Coat <= 20 && i.Bag >= 0 && i.Bag <= 20 && i.Backpack >= 0 && i.Backpack <= 20 && i.total() > 0 && i.total() <= 20
}
func (i Items) fits(other Items) bool {
	return i.valid() && i.Coat <= other.Coat && i.Bag <= other.Bag && i.Backpack <= other.Backpack
}
func (i Items) subtract(other Items) Items {
	return Items{i.Coat - other.Coat, i.Bag - other.Bag, i.Backpack - other.Backpack}
}
func (i Items) fitsKind(kind string) bool {
	return kind == "any" || kind == "coat" && i.Bag+i.Backpack == 0 || kind == "bag" && i.Coat == 0
}

type Command struct {
	Action     string `json:"action"`
	Code       string `json:"code,omitempty"`
	ZoneID     string `json:"zoneId,omitempty"`
	DepositID  string `json:"depositId,omitempty"`
	RequestID  string `json:"requestId,omitempty"`
	Revision   int    `json:"revision,omitempty"`
	Items      Items  `json:"items,omitempty"`
	Additional bool   `json:"additional,omitempty"`
	PickupID   string `json:"pickupId,omitempty"`
	Reason     string `json:"reason,omitempty"`
	Name       string `json:"name,omitempty"`
	Prefix     string `json:"prefix,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Capacity   int    `json:"capacity,omitempty"`
	Enabled    bool   `json:"enabled,omitempty"`
	Email      string `json:"email,omitempty"`
	Role       string `json:"role,omitempty"`
	UserID     string `json:"userId,omitempty"`
}
type access struct {
	Manage    bool
	Recover   bool
	Accepting bool
	Title     string
}
type deposit struct {
	ID, UserID, ZoneID, SlotID, Status string
	Items, Remaining                   Items
	Revision                           int
	Until                              time.Time
	PickupID                           string
	PickupItems                        Items
	PickupExpires, PickupApproved      *time.Time
}

// The event row serializes allocations, staff changes and all custody changes.
// This keeps retries and simultaneous scanners consistent, with DB uniqueness
// as a second line of defence. No client decides that a place is free.
func (h *Handler) permission(ctx context.Context, tx pgx.Tx, event, actor string) (access, error) {
	var a access
	// Acquire the event lock before reading staff membership. A single SELECT
	// that checks staff and waits for this lock can retain the old statement
	// snapshot after a concurrent revocation/demotion commits: staff updates do
	// not modify the event tuple, so PostgreSQL would not recheck that predicate.
	var locked string
	err := tx.QueryRow(ctx, `SELECT id::text FROM events WHERE id=$1::uuid FOR UPDATE`, event).Scan(&locked)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, fault{403, "WARDROBE_ACCESS_DENIED"}
	}
	if err != nil {
		return a, err
	}
	err = tx.QueryRow(ctx, `SELECT e.organizer_id=$2::uuid,
 e.organizer_id=$2::uuid OR EXISTS(SELECT 1 FROM wardrobe_staff s WHERE s.event_id=e.id AND s.user_id=$2::uuid AND s.role='supervisor'),
 e.status='published' AND e.end_time>now(),e.title
 FROM events e WHERE e.id=$1::uuid AND (e.organizer_id=$2::uuid OR EXISTS(SELECT 1 FROM wardrobe_staff s WHERE s.event_id=e.id AND s.user_id=$2::uuid))`, event, actor).Scan(&a.Manage, &a.Recover, &a.Accepting, &a.Title)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, fault{403, "WARDROBE_ACCESS_DENIED"}
	}
	return a, err
}
func validID(s string) bool { var id pgtype.UUID; return id.Scan(s) == nil && id.Valid }
func profileID(code string) string {
	match := profilePattern.FindStringSubmatch(strings.TrimSpace(code))
	if len(match) != 2 {
		return ""
	}
	return strings.ToLower(match[1])
}
func (h *Handler) actor(r *http.Request) (string, error) {
	id, err := auth.GetUserIDFromContext(r.Context())
	if err != nil || !validID(id) {
		return "", fault{401, "UNAUTHORIZED"}
	}
	var active bool
	err = h.Pool.QueryRow(r.Context(), `SELECT is_active FROM users WHERE id=$1::uuid`, id).Scan(&active)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && !active {
		return "", fault{401, "UNAUTHORIZED"}
	}
	return id, err
}
func respond(w http.ResponseWriter, result any, err error) {
	w.Header().Set("Cache-Control", "no-store")
	if err != nil {
		var f fault
		var pgerr *pgconn.PgError
		if errors.As(err, &f) {
			router.RespondWithError(w, f.status, f.code)
		} else if errors.As(err, &pgerr) && (pgerr.Code == "23505" || pgerr.Code == "23503") {
			router.RespondWithError(w, 409, "WARDROBE_CONFLICT")
		} else {
			log.Printf("wardrobe operation failed: %v", err)
			router.RespondWithError(w, 500, "WARDROBE_UNAVAILABLE")
		}
		return
	}
	router.RespondWithJSON(w, 200, result)
}
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/mine", h.mine)
	r.Post("/mine/{depositId}/confirm", h.confirm)
	r.Get("/events", h.events)
	r.Get("/events/{eventId}", h.overview)
	r.Get("/events/{eventId}/deposits/{depositId}", h.getDeposit)
	r.Post("/events/{eventId}/commands", h.command)
	return r
}

func (h *Handler) getDeposit(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actor(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	event, id := chi.URLParam(r, "eventId"), chi.URLParam(r, "depositId")
	if !validID(event) || !validID(id) {
		respond(w, nil, fault{400, "INVALID_DEPOSIT"})
		return
	}
	ctx := r.Context()
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		respond(w, nil, err)
		return
	}
	defer tx.Rollback(ctx)
	if _, err = h.permission(ctx, tx, event, actor); err != nil {
		respond(w, nil, err)
		return
	}
	if _, err = readDeposit(ctx, tx, event, id); err != nil {
		respond(w, nil, err)
		return
	}
	result, err := depositResult(ctx, tx, id)
	respond(w, result, err)
}

const depositJSON = `jsonb_build_object('id',d.id,'eventId',d.event_id,'eventTitle',e.title,'userId',d.user_id,
 'customerName',coalesce(u.username,''),'zoneId',d.zone_id,'zoneName',z.name,'number',z.prefix||lpad(s.number::text,greatest(3,length(s.number::text)),'0'),
 'status',d.status,'items',d.items,'remaining',d.remaining,'revision',d.revision,'reservedUntil',d.reserved_until,
 'createdAt',d.created_at,'storedAt',d.stored_at,'returnedAt',d.returned_at,
 'pickupId',CASE WHEN d.pickup_expires_at>now() THEN d.pickup_id ELSE NULL END,
 'pickupItems',CASE WHEN d.pickup_expires_at>now() THEN d.pickup_items ELSE NULL END,
 'pickupExpiresAt',d.pickup_expires_at,'pickupApproved',d.pickup_expires_at>now() AND d.pickup_approved_at IS NOT NULL)`
const depositJoins = ` FROM wardrobe_deposits d JOIN events e ON e.id=d.event_id JOIN wardrobe_zones z ON z.id=d.zone_id JOIN wardrobe_slots s ON s.id=d.slot_id LEFT JOIN users u ON u.id=d.user_id `

func jsonRows(ctx context.Context, tx interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, sql string, args ...any) ([]json.RawMessage, error) {
	rows, err := tx.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var b json.RawMessage
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
func (h *Handler) events(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actor(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	rows, err := jsonRows(r.Context(), h.Pool, `SELECT jsonb_build_object('id',e.id,'title',e.title,'canManage',e.organizer_id=$1::uuid)
 FROM events e WHERE e.organizer_id=$1::uuid OR EXISTS(SELECT 1 FROM wardrobe_staff s WHERE s.event_id=e.id AND s.user_id=$1::uuid)
 ORDER BY EXISTS(SELECT 1 FROM wardrobe_deposits d WHERE d.event_id=e.id AND d.status='stored') DESC,(e.end_time>now()) DESC,e.start_time DESC LIMIT 200`, actor)
	respond(w, rows, err)
}
func (h *Handler) mine(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actor(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	rows, err := jsonRows(r.Context(), h.Pool, `SELECT `+depositJSON+depositJoins+`WHERE d.user_id=$1::uuid AND (d.status='stored' OR d.status='reserved' AND d.reserved_until>now()) ORDER BY d.created_at DESC`, actor)
	if err != nil {
		respond(w, nil, err)
		return
	}
	var staff bool
	err = h.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM wardrobe_staff WHERE user_id=$1::uuid) OR EXISTS(SELECT 1 FROM events WHERE organizer_id=$1::uuid)`, actor).Scan(&staff)
	respond(w, map[string]any{"deposits": rows, "staffAccess": staff}, err)
}
func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actor(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	event := chi.URLParam(r, "eventId")
	if !validID(event) {
		respond(w, nil, fault{400, "INVALID_EVENT"})
		return
	}
	ctx := r.Context()
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		respond(w, nil, err)
		return
	}
	defer tx.Rollback(ctx)
	a, err := h.permission(ctx, tx, event, actor)
	if err != nil {
		respond(w, nil, err)
		return
	}
	zones, err := jsonRows(ctx, tx, `SELECT jsonb_build_object('id',z.id,'name',z.name,'prefix',z.prefix,'kind',z.kind,'capacity',z.capacity,'enabled',z.enabled,'revision',z.revision,
 'occupied',(SELECT count(*) FROM wardrobe_deposits d WHERE d.zone_id=z.id AND (d.status='stored' OR d.status='reserved' AND d.reserved_until>now())))
 FROM wardrobe_zones z WHERE event_id=$1::uuid ORDER BY prefix`, event)
	if err != nil {
		respond(w, nil, err)
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 100 {
		respond(w, nil, fault{400, "INVALID_SEARCH"})
		return
	}
	before := r.URL.Query().Get("before")
	if before != "" && !validID(before) {
		respond(w, nil, fault{400, "INVALID_CURSOR"})
		return
	}
	history := r.URL.Query().Get("history") == "true"
	unclaimed := r.URL.Query().Get("unclaimed") == "true"
	var eventEnded bool
	var unclaimedCount, unclaimedItems int64
	err = tx.QueryRow(ctx, `SELECT e.end_time<=now(),count(d.id),
 coalesce(sum((d.remaining->>'coat')::int+(d.remaining->>'bag')::int+(d.remaining->>'backpack')::int),0)
 FROM events e LEFT JOIN wardrobe_deposits d ON d.event_id=e.id AND d.status='stored' AND e.end_time<=now()
 WHERE e.id=$1::uuid GROUP BY e.id`, event).Scan(&eventEnded, &unclaimedCount, &unclaimedItems)
	if err != nil {
		respond(w, nil, err)
		return
	}
	// Normal lists keep their newest-first pagination. Unclaimed belongings use
	// their actual check-in time, oldest first, with the same key for the cursor.
	cursorFilter := `($4='' OR (d.created_at,d.id)<(SELECT created_at,id FROM wardrobe_deposits WHERE id=nullif($4,'')::uuid AND event_id=$1::uuid))`
	order := `d.created_at DESC,d.id DESC`
	if unclaimed {
		cursorFilter = `($4='' OR (coalesce(d.stored_at,d.created_at),d.id)>(SELECT coalesce(stored_at,created_at),id FROM wardrobe_deposits WHERE id=nullif($4,'')::uuid AND event_id=$1::uuid))`
		order = `coalesce(d.stored_at,d.created_at) ASC,d.id ASC`
	}
	deposits, err := jsonRows(ctx, tx, `SELECT `+depositJSON+depositJoins+`WHERE d.event_id=$1::uuid
 AND (CASE WHEN $5 THEN d.status='stored' AND e.end_time<=now() WHEN $2 THEN d.status IN ('returned','cancelled') ELSE d.status='stored' OR d.status='reserved' AND d.reserved_until>now() END)
 AND ($3='' OR position(lower($3) in lower(coalesce(u.username,'')||' '||z.prefix||lpad(s.number::text,greatest(3,length(s.number::text)),'0')))>0)
 AND `+cursorFilter+` ORDER BY `+order+` LIMIT 61`, event, history, query, before, unclaimed)
	if err != nil {
		respond(w, nil, err)
		return
	}
	next := ""
	if len(deposits) > 60 {
		deposits = deposits[:60]
		var last struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(deposits[59], &last)
		next = last.ID
	}
	staff := []json.RawMessage{}
	if a.Manage {
		staff, err = jsonRows(ctx, tx, `SELECT jsonb_build_object('id',s.user_id,'name',u.username,'role',s.role) FROM wardrobe_staff s JOIN users u ON u.id=s.user_id WHERE s.event_id=$1::uuid ORDER BY u.username`, event)
		if err != nil {
			respond(w, nil, err)
			return
		}
	}
	audit, err := jsonRows(ctx, tx, `SELECT jsonb_build_object('id',a.id::text,'action',a.action,'actor',coalesce(u.username,''),'depositId',a.deposit_id,'details',a.details,'at',a.created_at)
 FROM wardrobe_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.event_id=$1::uuid ORDER BY a.id DESC LIMIT 50`, event)
	respond(w, map[string]any{"eventId": event, "title": a.Title, "canManage": a.Manage, "canRecover": a.Recover, "accepting": a.Accepting, "eventEnded": eventEnded, "unclaimedCount": unclaimedCount, "unclaimedItems": unclaimedItems, "zones": zones, "staff": staff, "deposits": deposits, "nextCursor": next, "audit": audit}, err)
}
func audit(ctx context.Context, tx pgx.Tx, event, actor, id, action string, details any) error {
	raw, err := json.Marshal(details)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO wardrobe_audit(event_id,actor_id,deposit_id,action,details) VALUES($1::uuid,$2::uuid,nullif($3,'')::uuid,$4,$5)`, event, actor, id, action, raw)
	return err
}
func expire(ctx context.Context, tx pgx.Tx, event string) error {
	_, err := tx.Exec(ctx, `WITH expired AS (UPDATE wardrobe_deposits SET status='cancelled',revision=revision+1 WHERE event_id=$1::uuid AND status='reserved' AND reserved_until<=now() RETURNING id,event_id)
 INSERT INTO wardrobe_audit(event_id,deposit_id,action) SELECT event_id,id,'expired' FROM expired`, event)
	return err
}
func readDeposit(ctx context.Context, tx pgx.Tx, event, id string) (deposit, error) {
	var d deposit
	var items, remaining, pickup []byte
	err := tx.QueryRow(ctx, `SELECT id::text,coalesce(user_id::text,''),zone_id::text,slot_id::text,status,items,remaining,revision,reserved_until,
 coalesce(pickup_id::text,''),coalesce(pickup_items,'{}'::jsonb),pickup_expires_at,pickup_approved_at FROM wardrobe_deposits WHERE id=$1::uuid AND event_id=$2::uuid FOR UPDATE`, id, event).
		Scan(&d.ID, &d.UserID, &d.ZoneID, &d.SlotID, &d.Status, &items, &remaining, &d.Revision, &d.Until, &d.PickupID, &pickup, &d.PickupExpires, &d.PickupApproved)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, fault{404, "WARDROBE_NOT_FOUND"}
	}
	if err != nil {
		return d, err
	}
	if err = json.Unmarshal(items, &d.Items); err == nil {
		err = json.Unmarshal(remaining, &d.Remaining)
	}
	if err == nil {
		err = json.Unmarshal(pickup, &d.PickupItems)
	}
	return d, err
}
func availableSlot(ctx context.Context, tx pgx.Tx, event, zone, exclude string, items Items) (string, error) {
	var kind string
	var enabled bool
	err := tx.QueryRow(ctx, `SELECT kind,enabled FROM wardrobe_zones WHERE id=$1::uuid AND event_id=$2::uuid`, zone, event).Scan(&kind, &enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fault{404, "WARDROBE_ZONE_NOT_FOUND"}
	}
	if err != nil {
		return "", err
	}
	if !enabled {
		return "", conflict("WARDROBE_ZONE_DISABLED")
	}
	if !items.fitsKind(kind) {
		return "", fault{400, "WARDROBE_WRONG_ZONE"}
	}
	var slot string
	err = tx.QueryRow(ctx, `SELECT s.id::text FROM wardrobe_slots s WHERE zone_id=$1::uuid AND s.id::text<>$2
 AND NOT EXISTS(SELECT 1 FROM wardrobe_deposits d WHERE d.slot_id=s.id AND d.status IN ('reserved','stored')) ORDER BY number LIMIT 1`, zone, exclude).Scan(&slot)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", conflict("WARDROBE_FULL")
	}
	return slot, err
}
func (h *Handler) command(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actor(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	event := chi.URLParam(r, "eventId")
	if !validID(event) {
		respond(w, nil, fault{400, "INVALID_EVENT"})
		return
	}
	var c Command
	if !router.DecodeJSON(w, r, &c, 8192) {
		return
	}
	ctx := r.Context()
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		respond(w, nil, err)
		return
	}
	defer tx.Rollback(ctx)
	a, err := h.permission(ctx, tx, event, actor)
	if err != nil {
		respond(w, nil, err)
		return
	}
	if err = expire(ctx, tx, event); err != nil {
		respond(w, nil, err)
		return
	}
	result, err := h.execute(ctx, tx, event, actor, a, c)
	if err == nil {
		err = tx.Commit(ctx)
	}
	respond(w, result, err)
}
func (h *Handler) execute(ctx context.Context, tx pgx.Tx, event, actor string, a access, c Command) (any, error) {
	switch c.Action {
	case "zone", "staff", "remove-staff":
		if !a.Manage {
			return nil, fault{403, "WARDROBE_MANAGER_REQUIRED"}
		}
		return h.configure(ctx, tx, event, actor, c)
	case "lookup", "reserve":
		customer := profileID(c.Code)
		if customer == "" {
			return nil, fault{400, "WARDROBE_INVALID_QR"}
		}
		var active bool
		if err := tx.QueryRow(ctx, `SELECT is_active FROM users WHERE id=$1::uuid`, customer).Scan(&active); errors.Is(err, pgx.ErrNoRows) || err == nil && !active {
			return nil, fault{404, "WARDROBE_CUSTOMER_NOT_FOUND"}
		} else if err != nil {
			return nil, err
		}
		if c.Action == "lookup" {
			rows, err := jsonRows(ctx, tx, `SELECT `+depositJSON+depositJoins+`WHERE d.event_id=$1::uuid AND d.user_id=$2::uuid AND d.status IN ('reserved','stored') ORDER BY d.created_at DESC`, event, customer)
			return map[string]any{"deposits": rows}, err
		}
		return h.reserve(ctx, tx, event, actor, customer, a, c)
	}
	if !validID(c.DepositID) {
		return nil, fault{400, "INVALID_DEPOSIT"}
	}
	d, err := readDeposit(ctx, tx, event, c.DepositID)
	if err != nil {
		return nil, err
	}
	if c.Revision != d.Revision {
		return nil, conflict("WARDROBE_CHANGED")
	}
	details := map[string]any{}
	switch c.Action {
	case "store":
		if d.Status != "reserved" || !d.Until.After(time.Now()) {
			return nil, conflict("WARDROBE_RESERVATION_EXPIRED")
		}
		_, err = tx.Exec(ctx, `UPDATE wardrobe_deposits SET status='stored',stored_at=now(),revision=revision+1 WHERE id=$1::uuid`, d.ID)
	case "cancel":
		if d.Status != "reserved" {
			return nil, conflict("WARDROBE_CHANGED")
		}
		_, err = tx.Exec(ctx, `UPDATE wardrobe_deposits SET status='cancelled',revision=revision+1 WHERE id=$1::uuid`, d.ID)
	case "move":
		if (d.Status != "reserved" && d.Status != "stored") || !validID(c.ZoneID) {
			return nil, conflict("WARDROBE_CHANGED")
		}
		slot, e := availableSlot(ctx, tx, event, c.ZoneID, d.SlotID, d.Remaining)
		if e != nil {
			return nil, e
		}
		details = map[string]any{"fromSlot": d.SlotID, "toSlot": slot}
		_, err = tx.Exec(ctx, `UPDATE wardrobe_deposits SET slot_id=$2::uuid,zone_id=$3::uuid,revision=revision+1,pickup_id=NULL,pickup_items=NULL,pickup_expires_at=NULL,pickup_approved_at=NULL WHERE id=$1::uuid`, d.ID, slot, c.ZoneID)
	case "request-pickup":
		if d.Status != "stored" || !c.Items.fits(d.Remaining) {
			return nil, fault{400, "WARDROBE_INVALID_ITEMS"}
		}
		raw, _ := json.Marshal(c.Items)
		details["items"] = c.Items
		_, err = tx.Exec(ctx, `UPDATE wardrobe_deposits SET pickup_id=gen_random_uuid(),pickup_items=$2,pickup_expires_at=now()+interval '3 minutes',pickup_approved_at=NULL,revision=revision+1 WHERE id=$1::uuid`, d.ID, raw)
	case "return", "recover":
		if d.Status != "stored" {
			return nil, conflict("WARDROBE_CHANGED")
		}
		selected := d.PickupItems
		if c.Action == "recover" {
			if !a.Recover {
				return nil, fault{403, "WARDROBE_SUPERVISOR_REQUIRED"}
			}
			c.Reason = strings.TrimSpace(c.Reason)
			if len([]rune(c.Reason)) < 12 || len([]rune(c.Reason)) > 300 {
				return nil, fault{400, "WARDROBE_RECOVERY_REASON_REQUIRED"}
			}
			selected = c.Items
			details["reason"] = c.Reason
		} else if d.PickupApproved == nil || d.PickupExpires == nil || !d.PickupExpires.After(time.Now()) || c.PickupID != d.PickupID {
			return nil, conflict("WARDROBE_CONFIRMATION_REQUIRED")
		}
		if !selected.fits(d.Remaining) {
			return nil, fault{400, "WARDROBE_INVALID_ITEMS"}
		}
		left := d.Remaining.subtract(selected)
		raw, _ := json.Marshal(left)
		status := "stored"
		if left.total() == 0 {
			status = "returned"
		}
		details["items"] = selected
		_, err = tx.Exec(ctx, `UPDATE wardrobe_deposits SET remaining=$2,status=$3,returned_at=CASE WHEN $3='returned' THEN now() ELSE NULL END,
   pickup_id=NULL,pickup_items=NULL,pickup_expires_at=NULL,pickup_approved_at=NULL,revision=revision+1 WHERE id=$1::uuid`, d.ID, raw, status)
	default:
		return nil, fault{400, "WARDROBE_INVALID_ACTION"}
	}
	if err != nil {
		return nil, err
	}
	if err = audit(ctx, tx, event, actor, d.ID, c.Action, details); err != nil {
		return nil, err
	}
	return depositResult(ctx, tx, d.ID)
}
func depositResult(ctx context.Context, tx pgx.Tx, id string) (any, error) {
	var raw json.RawMessage
	err := tx.QueryRow(ctx, `SELECT `+depositJSON+depositJoins+`WHERE d.id=$1::uuid`, id).Scan(&raw)
	return map[string]any{"deposit": raw}, err
}
func (h *Handler) reserve(ctx context.Context, tx pgx.Tx, event, actor, customer string, a access, c Command) (any, error) {
	if !validID(c.RequestID) || !validID(c.ZoneID) || !c.Items.valid() {
		return nil, fault{400, "WARDROBE_INVALID_ITEMS"}
	}
	raw, _ := json.Marshal(struct {
		Customer, Zone string
		Items          Items
		Additional     bool
	}{customer, c.ZoneID, c.Items, c.Additional})
	sum := sha256.Sum256(raw)
	hash := hex.EncodeToString(sum[:])
	var existing, previous string
	err := tx.QueryRow(ctx, `SELECT id::text,request_hash FROM wardrobe_deposits WHERE event_id=$1::uuid AND request_id=$2::uuid`, event, c.RequestID).Scan(&existing, &previous)
	if err == nil {
		if hash != previous {
			return nil, conflict("WARDROBE_REQUEST_REUSED")
		}
		return depositResult(ctx, tx, existing)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if !c.Additional {
		err = tx.QueryRow(ctx, `SELECT id::text FROM wardrobe_deposits WHERE event_id=$1::uuid AND user_id=$2::uuid AND status IN ('reserved','stored') ORDER BY created_at DESC LIMIT 1`, event, customer).Scan(&existing)
		if err == nil {
			return depositResult(ctx, tx, existing)
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}
	if !a.Accepting {
		return nil, conflict("WARDROBE_EVENT_CLOSED")
	}
	slot, err := availableSlot(ctx, tx, event, c.ZoneID, "", c.Items)
	if err != nil {
		return nil, err
	}
	raw, _ = json.Marshal(c.Items)
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO wardrobe_deposits(event_id,user_id,zone_id,slot_id,request_id,request_hash,status,items,remaining)
 VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,'reserved',$7,$7) RETURNING id::text`, event, customer, c.ZoneID, slot, c.RequestID, hash, raw).Scan(&id)
	if err != nil {
		return nil, err
	}
	if err = audit(ctx, tx, event, actor, id, "reserve", map[string]any{"items": c.Items}); err != nil {
		return nil, err
	}
	return depositResult(ctx, tx, id)
}
func (h *Handler) configure(ctx context.Context, tx pgx.Tx, event, actor string, c Command) (any, error) {
	if c.Action != "remove-staff" {
		var expired bool
		if err := tx.QueryRow(ctx, `SELECT end_time <= now()-interval '168 hours'
 AND NOT EXISTS(SELECT 1 FROM wardrobe_deposits WHERE event_id=$1::uuid)
 FROM events WHERE id=$1::uuid`, event).Scan(&expired); err != nil {
			return nil, err
		}
		if expired {
			return nil, conflict("WARDROBE_EVENT_CLOSED")
		}
	}
	switch c.Action {
	case "staff":
		c.Email = strings.ToLower(strings.TrimSpace(c.Email))
		if len(c.Email) > 254 || (c.Role != "operator" && c.Role != "supervisor") {
			return nil, fault{400, "WARDROBE_INVALID_STAFF"}
		}
		var id string
		err := tx.QueryRow(ctx, `SELECT id::text FROM users WHERE lower(email)=$1 AND is_active=true`, c.Email).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fault{404, "WARDROBE_STAFF_NOT_FOUND"}
		}
		if err != nil {
			return nil, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO wardrobe_staff(event_id,user_id,role) VALUES($1::uuid,$2::uuid,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET role=excluded.role`, event, id, c.Role); err != nil {
			return nil, err
		}
		if err = audit(ctx, tx, event, actor, "", "staff", map[string]any{"userId": id, "role": c.Role}); err != nil {
			return nil, err
		}
	case "remove-staff":
		if !validID(c.UserID) {
			return nil, fault{400, "WARDROBE_INVALID_STAFF"}
		}
		if _, err := tx.Exec(ctx, `DELETE FROM wardrobe_staff WHERE event_id=$1::uuid AND user_id=$2::uuid`, event, c.UserID); err != nil {
			return nil, err
		}
		if err := audit(ctx, tx, event, actor, "", "remove-staff", map[string]any{"userId": c.UserID}); err != nil {
			return nil, err
		}
	case "zone":
		c.Name = strings.TrimSpace(c.Name)
		c.Prefix = strings.ToUpper(strings.TrimSpace(c.Prefix))
		if len([]rune(c.Name)) < 1 || len([]rune(c.Name)) > 60 || !prefixPattern.MatchString(c.Prefix) || c.Capacity < 1 || c.Capacity > 2000 || (c.Kind != "any" && c.Kind != "coat" && c.Kind != "bag") {
			return nil, fault{400, "WARDROBE_INVALID_ZONE"}
		}
		id := c.ZoneID
		if id == "" {
			var count int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM wardrobe_zones WHERE event_id=$1::uuid`, event).Scan(&count); err != nil {
				return nil, err
			}
			if count >= 20 {
				return nil, conflict("WARDROBE_ZONE_LIMIT")
			}
			err := tx.QueryRow(ctx, `INSERT INTO wardrobe_zones(event_id,name,prefix,kind,capacity,enabled) VALUES($1::uuid,$2,$3,$4,$5,$6) RETURNING id::text`, event, c.Name, c.Prefix, c.Kind, c.Capacity, c.Enabled).Scan(&id)
			if err != nil {
				return nil, err
			}
		} else {
			if !validID(id) {
				return nil, fault{400, "WARDROBE_INVALID_ZONE"}
			}
			// Numbering and item type stay immutable after creation: labels on stored
			// property and historical receipts must keep their meaning.
			tag, err := tx.Exec(ctx, `UPDATE wardrobe_zones SET name=$3,enabled=$4,revision=revision+1 WHERE id=$1::uuid AND event_id=$2::uuid AND revision=$5 AND capacity=$6 AND prefix=$7 AND kind=$8`, id, event, c.Name, c.Enabled, c.Revision, c.Capacity, c.Prefix, c.Kind)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() != 1 {
				return nil, conflict("WARDROBE_CHANGED")
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO wardrobe_slots(zone_id,number) SELECT $1::uuid,generate_series(1,$2::int) ON CONFLICT DO NOTHING`, id, c.Capacity); err != nil {
			return nil, err
		}
		if err := audit(ctx, tx, event, actor, "", "zone", map[string]any{"zoneId": id, "prefix": c.Prefix, "capacity": c.Capacity, "enabled": c.Enabled}); err != nil {
			return nil, err
		}
	}
	return map[string]bool{"ok": true}, nil
}
func (h *Handler) confirm(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actor(r)
	if err != nil {
		respond(w, nil, err)
		return
	}
	id := chi.URLParam(r, "depositId")
	if !validID(id) {
		respond(w, nil, fault{400, "INVALID_DEPOSIT"})
		return
	}
	var c struct {
		PickupID string `json:"pickupId"`
		Approve  bool   `json:"approve"`
	}
	if !router.DecodeJSON(w, r, &c, 1024) {
		return
	}
	if !validID(c.PickupID) {
		respond(w, nil, fault{400, "INVALID_PICKUP"})
		return
	}
	ctx := r.Context()
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		respond(w, nil, err)
		return
	}
	defer tx.Rollback(ctx)
	var event string
	err = tx.QueryRow(ctx, `SELECT event_id::text FROM wardrobe_deposits WHERE id=$1::uuid AND user_id=$2::uuid`, id, actor).Scan(&event)
	if errors.Is(err, pgx.ErrNoRows) {
		respond(w, nil, fault{404, "WARDROBE_NOT_FOUND"})
		return
	}
	if err != nil {
		respond(w, nil, err)
		return
	}
	// Same lock order as staff operations, including against revocation/return.
	var locked string
	if err = tx.QueryRow(ctx, `SELECT id::text FROM events WHERE id=$1::uuid FOR UPDATE`, event).Scan(&locked); err != nil {
		respond(w, nil, err)
		return
	}
	d, err := readDeposit(ctx, tx, event, id)
	if err != nil {
		respond(w, nil, err)
		return
	}
	if d.UserID != actor || d.Status != "stored" || d.PickupID != c.PickupID || d.PickupExpires == nil || !d.PickupExpires.After(time.Now()) {
		respond(w, nil, conflict("WARDROBE_CHANGED"))
		return
	}
	if c.Approve {
		if d.PickupApproved == nil {
			_, err = tx.Exec(ctx, `UPDATE wardrobe_deposits SET pickup_approved_at=now(),revision=revision+1 WHERE id=$1::uuid`, id)
		}
	} else {
		_, err = tx.Exec(ctx, `UPDATE wardrobe_deposits SET pickup_id=NULL,pickup_items=NULL,pickup_expires_at=NULL,pickup_approved_at=NULL,revision=revision+1 WHERE id=$1::uuid`, id)
	}
	if err == nil {
		err = audit(ctx, tx, event, actor, id, "customer-confirm", map[string]bool{"approved": c.Approve})
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	respond(w, map[string]bool{"ok": true}, err)
}

// String is only used in unit diagnostics; no profile QR or email is logged.
func (i Items) String() string { return fmt.Sprintf("%d/%d/%d", i.Coat, i.Bag, i.Backpack) }

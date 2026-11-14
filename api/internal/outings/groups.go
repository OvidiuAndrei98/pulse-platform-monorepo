package outings

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/router"
)

// One rule for invitations and the permanent group's total membership.
const maxGroupMembers = 8

type groupMember struct {
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	Status    string `json:"status"`
}
type friendGroup struct {
	ID              string        `json:"id"`
	Name            string        `json:"name"`
	OwnerID         string        `json:"ownerId"`
	Status          string        `json:"status"`
	Revision        int64         `json:"revision"`
	LastSeq         int64         `json:"lastSeq"`
	Unread          int           `json:"unread"`
	Muted           bool          `json:"muted"`
	VisibleAfterSeq int64         `json:"visibleAfterSeq"`
	JoinedAt        *time.Time    `json:"joinedAt,omitempty"`
	Members         []groupMember `json:"members"`
	Preview         string        `json:"preview"`
	Outings         []plan        `json:"outings"`
	OutingsHasMore  bool          `json:"outingsHasMore"`
}
type groupMessage struct {
	ID        string       `json:"id"`
	RequestID string       `json:"requestId"`
	Seq       int64        `json:"seq"`
	SenderID  string       `json:"senderId"`
	Username  string       `json:"username"`
	AvatarURL string       `json:"avatarUrl,omitempty"`
	Kind      string       `json:"kind"`
	Content   string       `json:"content"`
	EventID   string       `json:"eventId,omitempty"`
	OutingID  string       `json:"outingId,omitempty"`
	CreatedAt time.Time    `json:"createdAt"`
	Event     *sharedEvent `json:"event,omitempty"`
}
type sharedEvent struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	ImageURL  string    `json:"imageUrl"`
	Location  string    `json:"location"`
	City      string    `json:"city"`
	StartTime time.Time `json:"startTime"`
	EndTime   time.Time `json:"endTime"`
	Status    string    `json:"status"`
}

func groupAccess(ctx context.Context, q queryer, id, actor pgtype.UUID, lock bool) (friendGroup, error) {
	g := friendGroup{Members: []groupMember{}, Outings: []plan{}}
	suffix := ""
	if lock {
		suffix = " FOR UPDATE OF g,m"
	}
	err := q.QueryRow(ctx, `SELECT g.id::text,g.name,COALESCE(g.owner_id::text,''),m.status,g.revision,g.last_message_seq,m.muted,m.visible_after_seq,m.joined_at
 FROM friend_groups g JOIN friend_group_members m ON m.group_id=g.id
 JOIN users active_user ON active_user.id=m.user_id AND active_user.is_active
 WHERE g.id=$1 AND g.owner_id IS NOT NULL AND m.user_id=$2 AND m.status IN ('pending','accepted')`+suffix, id, actor).
		Scan(&g.ID, &g.Name, &g.OwnerID, &g.Status, &g.Revision, &g.LastSeq, &g.Muted, &g.VisibleAfterSeq, &g.JoinedAt)
	return g, err
}
func readGroup(ctx context.Context, q queryer, id, actor pgtype.UUID, includeOutings ...bool) (friendGroup, error) {
	g, err := groupAccess(ctx, q, id, actor, false)
	if err != nil {
		return g, err
	}
	rows, err := q.Query(ctx, `SELECT u.id::text,u.username,COALESCE(u.avatar_url,''),m.status FROM friend_group_members m JOIN users u ON u.id=m.user_id AND u.is_active WHERE m.group_id=$1 AND m.status IN ('pending','accepted') ORDER BY m.joined_at NULLS LAST,u.id`, id)
	if err != nil {
		return g, err
	}
	for rows.Next() {
		var m groupMember
		if err = rows.Scan(&m.UserID, &m.Username, &m.AvatarURL, &m.Status); err != nil {
			break
		}
		g.Members = append(g.Members, m)
	}
	rows.Close()
	if err != nil {
		return g, err
	}
	if rows.Err() != nil {
		return g, rows.Err()
	}
	if g.Status != "accepted" {
		g.LastSeq = 0
		g.VisibleAfterSeq = 0
		g.Revision = 1
		return g, nil
	}
	err = q.QueryRow(ctx, `SELECT count(*) FROM friend_group_messages msg JOIN friend_group_members m ON m.group_id=msg.group_id AND m.user_id=$2 WHERE msg.group_id=$1 AND msg.seq>GREATEST(m.read_seq,m.visible_after_seq) AND msg.sender_id<>$2`, id, actor).Scan(&g.Unread)
	if err != nil {
		return g, err
	}
	// A new/rejoined member's preview obeys the same history boundary as messages.
	err = q.QueryRow(ctx, `SELECT COALESCE((SELECT CASE msg.kind WHEN 'text' THEN msg.content WHEN 'event' THEN COALESCE(e.title,'Event unavailable') ELSE p.title END FROM friend_group_messages msg LEFT JOIN events e ON e.id=msg.event_id LEFT JOIN outing_plans p ON p.id=msg.outing_id JOIN friend_group_members m ON m.group_id=msg.group_id AND m.user_id=$2 WHERE msg.group_id=$1 AND msg.seq>m.visible_after_seq ORDER BY msg.seq DESC LIMIT 1),'')`, id, actor).Scan(&g.Preview)
	if err != nil {
		return g, err
	}
	if len(includeOutings) > 0 && !includeOutings[0] {
		return g, nil
	}
	rows, err = q.Query(ctx, `SELECT p.id FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id AND m.user_id=$2 AND m.status='accepted' WHERE p.group_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 21`, id, actor)
	if err != nil {
		return g, err
	}
	ids := []pgtype.UUID{}
	for rows.Next() {
		var pid pgtype.UUID
		if err = rows.Scan(&pid); err != nil {
			break
		}
		ids = append(ids, pid)
	}
	rows.Close()
	if err != nil {
		return g, err
	}
	if rows.Err() != nil {
		return g, rows.Err()
	}
	if len(ids) > 20 {
		g.OutingsHasMore = true
		ids = ids[:20]
	}
	for _, pid := range ids {
		p, e := readPlan(ctx, q, pid, actor)
		if e != nil {
			return g, e
		}
		g.Outings = append(g.Outings, p)
	}
	return g, nil
}
func (h *Handler) listGroups(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	tx, err := h.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	rows, err := tx.Query(r.Context(), `SELECT g.id FROM friend_groups g JOIN friend_group_members m ON m.group_id=g.id WHERE m.user_id=$1 AND m.status IN ('pending','accepted') ORDER BY g.activity_at DESC,g.id LIMIT 100`, actor)
	if err != nil {
		return err
	}
	ids := []pgtype.UUID{}
	for rows.Next() {
		var id pgtype.UUID
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err != nil {
		return err
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	result := []friendGroup{}
	for _, id := range ids {
		g, e := readGroup(r.Context(), tx, id, actor, false)
		if errors.Is(e, pgx.ErrNoRows) {
			continue
		}
		if e != nil {
			return e
		}
		result = append(result, g)
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, result)
	return nil
}
func (h *Handler) getGroup(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "groupID"))
	if err != nil {
		return err
	}
	tx, err := h.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	g, err := readGroup(r.Context(), tx, id, actor)
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, g)
	return nil
}
func groupFingerprint(v any) string {
	b, _ := json.Marshal(v)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
func eligibleGroupFriend(ctx context.Context, q queryer, actor, friend pgtype.UUID) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM friendships f JOIN users u ON u.id=$2 AND u.is_active WHERE f.status='accepted' AND ((f.user_id=$1 AND f.friend_id=$2) OR (f.user_id=$2 AND f.friend_id=$1)))`, actor, friend).Scan(&ok)
	return ok, err
}
func (h *Handler) createGroup(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	var req struct {
		Name      string   `json:"name"`
		RequestID string   `json:"requestId"`
		FriendIDs []string `json:"friendIds"`
		EventID   string   `json:"eventId,omitempty"`
	}
	if err := body(r, &req); err != nil {
		return err
	}
	key, err := uuid(req.RequestID)
	if err != nil {
		return err
	}
	req.Name = strings.TrimSpace(req.Name)
	if utf8.RuneCountInString(req.Name) < 1 || utf8.RuneCountInString(req.Name) > 80 {
		return invalid("INVALID_TITLE")
	}
	friends, err := uniqueIDs(req.FriendIDs, 1, maxGroupMembers-1)
	if err != nil {
		return err
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	// Serialize retries from this creator, including simultaneous first requests.
	if _, err = tx.Exec(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, actor); err != nil {
		return err
	}
	fingerprint := groupFingerprint(req)
	var id pgtype.UUID
	var original string
	err = tx.QueryRow(r.Context(), `SELECT id,request_fingerprint FROM friend_groups WHERE created_by=$1 AND request_id=$2`, actor, key).Scan(&id, &original)
	if err == nil {
		if original != fingerprint {
			return conflict("REQUEST_REUSED")
		}
		g, e := readGroup(r.Context(), tx, id, actor)
		if e != nil {
			return e
		}
		router.RespondWithJSON(w, 200, g)
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	for _, friend := range friends {
		ok, e := eligibleGroupFriend(r.Context(), tx, actor, friend)
		if e != nil {
			return e
		}
		if !ok {
			return invalid("FRIEND_UNAVAILABLE")
		}
	}
	event := pgtype.UUID{}
	if req.EventID != "" {
		event, err = uuid(req.EventID)
		if err != nil {
			return err
		}
		var visible bool
		if err = tx.QueryRow(r.Context(), `SELECT status='published' FROM events WHERE id=$1`, event).Scan(&visible); err != nil {
			return err
		}
		if !visible {
			return invalid("EVENT_UNAVAILABLE")
		}
	}
	err = tx.QueryRow(r.Context(), `INSERT INTO friend_groups(owner_id,created_by,name,request_id,request_fingerprint) VALUES($1,$1,$2,$3,$4) RETURNING id`, actor, req.Name, key, fingerprint).Scan(&id)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO friend_group_members(group_id,user_id,status,invited_by,joined_at) VALUES($1,$2,'accepted',$2,CURRENT_TIMESTAMP)`, id, actor); err != nil {
		return err
	}
	for _, friend := range friends {
		if err = inviteGroupMember(r.Context(), tx, id, actor, friend); err != nil {
			return err
		}
	}
	if event.Valid {
		if err = appendGroupMessage(r.Context(), tx, id, actor, key, "event", "", event, pgtype.UUID{}); err != nil {
			return err
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	g, err := readGroup(r.Context(), h.Pool, id, actor)
	if err != nil {
		return err
	}
	router.RespondWithJSON(w, 201, g)
	return nil
}
func inviteGroupMember(ctx context.Context, q queryer, id, actor, friend pgtype.UUID) error {
	result, err := q.Exec(ctx, `INSERT INTO friend_group_members(group_id,user_id,status,invited_by) VALUES($1,$3,'pending',$2) ON CONFLICT(group_id,user_id) DO UPDATE SET status='pending',invited_by=$2 WHERE friend_group_members.status NOT IN ('pending','accepted')`, id, actor, friend)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return nil
	}
	_, err = q.Exec(ctx, `INSERT INTO notifications(user_id,type,title,body,actor_id,friend_group_id) VALUES($1,'friend_group_invite','Group invitation','You have been invited to a private friend group.',$2,$3)`, friend, actor, id)
	return err
}
func (h *Handler) groupAction(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "groupID"))
	if err != nil {
		return err
	}
	var req struct {
		Action string `json:"action"`
		UserID string `json:"userId,omitempty"`
		Name   string `json:"name,omitempty"`
		Muted  bool   `json:"muted,omitempty"`
		Seq    int64  `json:"seq,omitempty"`
	}
	if err = body(r, &req); err != nil {
		return err
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	g, err := groupAccess(r.Context(), tx, id, actor, true)
	if err != nil {
		return err
	}
	owner := g.OwnerID == sid(actor)
	if g.Status != "accepted" && req.Action != "accept" && req.Action != "decline" {
		return missing()
	}
	switch req.Action {
	case "accept":
		if g.Status == "pending" {
			var inviter pgtype.UUID
			if err = tx.QueryRow(r.Context(), `SELECT invited_by FROM friend_group_members WHERE group_id=$1 AND user_id=$2`, id, actor).Scan(&inviter); err != nil {
				return err
			}
			ok, e := eligibleGroupFriend(r.Context(), tx, inviter, actor)
			if e != nil {
				return e
			}
			if !ok {
				return invalid("FRIEND_UNAVAILABLE")
			}
			_, err = tx.Exec(r.Context(), `UPDATE friend_group_members SET status='accepted',joined_at=clock_timestamp(),visible_after_seq=$3,read_seq=$3 WHERE group_id=$1 AND user_id=$2`, id, actor, g.LastSeq)
			if err == nil {
				_, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_members(plan_id,user_id,status,ticket_status_shared) SELECT p.id,$2,'accepted',TRUE FROM outing_plans p WHERE p.group_id=$1 AND p.expires_at>CURRENT_TIMESTAMP ON CONFLICT(plan_id,user_id) DO UPDATE SET status='accepted',ticket_status_shared=TRUE`, id, actor)
			}
			if err == nil {
				_, err = tx.Exec(r.Context(), `UPDATE notifications SET read_at=COALESCE(read_at,clock_timestamp()) WHERE friend_group_id=$1 AND user_id=$2 AND type='friend_group_invite'`, id, actor)
			}
		}
	case "decline":
		if g.Status != "pending" {
			return conflict("INVITATION_CLOSED")
		}
		_, err = tx.Exec(r.Context(), `UPDATE friend_group_members SET status='declined' WHERE group_id=$1 AND user_id=$2`, id, actor)
	case "rename":
		if !owner {
			return missing()
		}
		name := strings.TrimSpace(req.Name)
		if utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 80 {
			return invalid("INVALID_TITLE")
		}
		_, err = tx.Exec(r.Context(), `UPDATE friend_groups SET name=$2 WHERE id=$1`, id, name)
	case "invite":
		if !owner {
			return missing()
		}
		friend, e := uuid(req.UserID)
		if e != nil {
			return e
		}
		ok, e := eligibleGroupFriend(r.Context(), tx, actor, friend)
		if e != nil {
			return e
		}
		if !ok {
			return invalid("FRIEND_UNAVAILABLE")
		}
		var count int
		var existing bool
		if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM friend_group_members WHERE group_id=$1 AND user_id=$2 AND status IN ('pending','accepted'))`, id, friend).Scan(&existing); err != nil {
			return err
		}
		if existing {
			router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
			return nil
		}
		if err = tx.QueryRow(r.Context(), `SELECT count(*) FROM friend_group_members WHERE group_id=$1 AND status IN ('pending','accepted')`, id).Scan(&count); err != nil {
			return err
		}
		if count >= maxGroupMembers {
			return conflict("GROUP_FULL")
		}
		err = inviteGroupMember(r.Context(), tx, id, actor, friend)
	case "transfer-admin":
		if !owner {
			return missing()
		}
		target, e := uuid(req.UserID)
		if e != nil {
			return e
		}
		result, e := tx.Exec(r.Context(), `UPDATE friend_groups SET owner_id=$2 WHERE id=$1 AND EXISTS(SELECT 1 FROM friend_group_members WHERE group_id=$1 AND user_id=$2 AND status='accepted')`, id, target)
		if e != nil {
			return e
		}
		if result.RowsAffected() == 0 {
			return missing()
		}
	case "leave", "remove":
		target := actor
		if req.Action == "remove" {
			if !owner {
				return missing()
			}
			target, err = uuid(req.UserID)
			if err != nil {
				return err
			}
			if target == actor {
				return invalid("TRANSFER_ADMIN_FIRST")
			}
		}
		if target == actor && owner {
			var other bool
			if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM friend_group_members WHERE group_id=$1 AND user_id<>$2 AND status IN ('pending','accepted'))`, id, actor).Scan(&other); err != nil {
				return err
			}
			if other {
				return conflict("TRANSFER_ADMIN_FIRST")
			}
		}
		status := "left"
		if req.Action == "remove" {
			status = "removed"
		}
		_, err = tx.Exec(r.Context(), `UPDATE friend_group_members SET status=$3 WHERE group_id=$1 AND user_id=$2`, id, target, status)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `UPDATE outing_plan_members m SET status='declined' FROM outing_plans p WHERE m.plan_id=p.id AND p.group_id=$1 AND m.user_id=$2`, id, target)
		if err != nil {
			return err
		}
		// The group admin inherits coordination only when the initiator actually leaves.
		_, err = tx.Exec(r.Context(), `UPDATE outing_plans SET owner_id=(SELECT owner_id FROM friend_groups WHERE id=$1) WHERE group_id=$1 AND owner_id=$2`, id, target)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `DELETE FROM notifications WHERE friend_group_id=$1 AND user_id=$2`, id, target)
	case "mute":
		_, err = tx.Exec(r.Context(), `UPDATE friend_group_members SET muted=$3 WHERE group_id=$1 AND user_id=$2`, id, actor, req.Muted)
	case "read":
		if req.Seq < 0 || req.Seq > g.LastSeq {
			return invalid("INVALID_CURSOR")
		}
		_, err = tx.Exec(r.Context(), `UPDATE friend_group_members SET read_seq=GREATEST(read_seq,$3) WHERE group_id=$1 AND user_id=$2`, id, actor, req.Seq)
		if err == nil && req.Seq == g.LastSeq {
			_, err = tx.Exec(r.Context(), `UPDATE notifications SET read_at=COALESCE(read_at,clock_timestamp()) WHERE friend_group_id=$1 AND user_id=$2 AND type='friend_group_message'`, id, actor)
		}
	default:
		return invalid("INVALID_ACTION")
	}
	if err != nil {
		return err
	}
	if req.Action != "read" && req.Action != "mute" {
		_, err = tx.Exec(r.Context(), `UPDATE friend_groups SET revision=revision+1 WHERE id=$1`, id)
	}
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
func (h *Handler) messages(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "groupID"))
	if err != nil {
		return err
	}
	tx, err := h.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	g, err := groupAccess(r.Context(), tx, id, actor, false)
	if err != nil {
		return err
	}
	if g.Status != "accepted" {
		return missing()
	}
	before := int64(0)
	if value := r.URL.Query().Get("before"); value != "" {
		before, err = strconv.ParseInt(value, 10, 64)
		if err != nil || before < 1 {
			return invalid("INVALID_CURSOR")
		}
	}
	collection := r.URL.Query().Get("collection") == "events"
	rows, err := tx.Query(r.Context(), `SELECT msg.id::text,msg.request_id::text,msg.seq,COALESCE(msg.sender_id::text,'00000000-0000-4000-8000-000000000000'),COALESCE(u.username,''),COALESCE(u.avatar_url,''),msg.kind,msg.content,COALESCE(msg.event_id::text,''),COALESCE(msg.outing_id::text,''),msg.created_at,
 e.id::text,COALESCE(e.title,''),COALESCE(e.banner_url,''),COALESCE(e.location_name,''),COALESCE(e.city,''),e.start_time,e.end_time,COALESCE(e.status::text,'')
 FROM friend_group_messages msg LEFT JOIN users u ON u.id=msg.sender_id LEFT JOIN events e ON e.id=msg.event_id JOIN friend_group_members member ON member.group_id=msg.group_id AND member.user_id=$2
 WHERE msg.group_id=$1 AND msg.seq>member.visible_after_seq AND ($3::bigint=0 OR msg.seq<$3) AND (NOT $4::boolean OR msg.kind='event')
 AND (NOT $4::boolean OR NOT EXISTS(SELECT 1 FROM friend_group_messages newer WHERE newer.group_id=msg.group_id AND newer.kind='event' AND newer.event_id=msg.event_id AND newer.seq>msg.seq AND newer.seq>member.visible_after_seq))
 ORDER BY msg.seq DESC LIMIT 51`, id, actor, before, collection)
	if err != nil {
		return err
	}
	result := []groupMessage{}
	for rows.Next() {
		var m groupMessage
		var event sharedEvent
		var eventID *string
		var start, end *time.Time
		if err = rows.Scan(&m.ID, &m.RequestID, &m.Seq, &m.SenderID, &m.Username, &m.AvatarURL, &m.Kind, &m.Content, &m.EventID, &m.OutingID, &m.CreatedAt,
			&eventID, &event.Title, &event.ImageURL, &event.Location, &event.City, &start, &end, &event.Status); err != nil {
			break
		}
		if eventID != nil && start != nil && end != nil {
			event.ID, event.StartTime, event.EndTime = *eventID, *start, *end
			m.Event = &event
		}
		result = append(result, m)
	}
	rows.Close()
	if err != nil {
		return err
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	more := len(result) > 50
	if more {
		result = result[:50]
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, map[string]any{"items": result, "hasMore": more, "revision": g.Revision})
	return nil
}
func appendGroupMessage(ctx context.Context, q queryer, group, actor, key pgtype.UUID, kind, content string, event, outing pgtype.UUID) error {
	var seq int64
	if err := q.QueryRow(ctx, `UPDATE friend_groups SET last_message_seq=last_message_seq+1,revision=revision+1,activity_at=clock_timestamp() WHERE id=$1 RETURNING last_message_seq`, group).Scan(&seq); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `INSERT INTO friend_group_messages(group_id,sender_id,request_id,seq,kind,content,event_id,outing_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, group, actor, key, seq, kind, content, event, outing)
	return err
}
func (h *Handler) sendGroupMessage(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "groupID"))
	if err != nil {
		return err
	}
	var req struct {
		RequestID string `json:"requestId"`
		Content   string `json:"content"`
		EventID   string `json:"eventId,omitempty"`
	}
	if err = body(r, &req); err != nil {
		return err
	}
	key, err := uuid(req.RequestID)
	if err != nil {
		return err
	}
	req.Content = strings.TrimSpace(req.Content)
	if utf8.RuneCountInString(req.Content) > 2000 || req.Content == "" && req.EventID == "" {
		return invalid("INVALID_MESSAGE")
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	g, err := groupAccess(r.Context(), tx, id, actor, true)
	if err != nil {
		return err
	}
	if g.Status != "accepted" {
		return missing()
	}
	event := pgtype.UUID{}
	kind := "text"
	if req.EventID != "" {
		event, err = uuid(req.EventID)
		if err != nil {
			return err
		}
		kind = "event"
		req.EventID = sid(event)
	}
	var oldContent, oldEvent string
	err = tx.QueryRow(r.Context(), `SELECT content,COALESCE(event_id::text,'') FROM friend_group_messages WHERE group_id=$1 AND sender_id=$2 AND request_id=$3`, id, actor, key).Scan(&oldContent, &oldEvent)
	if err == nil {
		if oldContent != req.Content || oldEvent != req.EventID {
			return conflict("REQUEST_REUSED")
		}
		router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if event.Valid {
		var visible bool
		if err = tx.QueryRow(r.Context(), `SELECT status='published' FROM events WHERE id=$1`, event).Scan(&visible); err != nil {
			return err
		}
		if !visible {
			return invalid("EVENT_UNAVAILABLE")
		}
	}
	if err = appendGroupMessage(r.Context(), tx, id, actor, key, kind, req.Content, event, pgtype.UUID{}); err != nil {
		return err
	}
	// One unread notification per recipient/group; message text never enters a
	// lock-screen preview. The existing outbox sends the first notice only.
	if _, err = tx.Exec(r.Context(), `UPDATE notifications n SET actor_id=$2,created_at=clock_timestamp()
 FROM friend_group_members m WHERE n.friend_group_id=$1 AND n.user_id=m.user_id AND m.group_id=$1
 AND m.status='accepted' AND NOT m.muted AND m.user_id<>$2 AND n.type='friend_group_message' AND n.read_at IS NULL`, id, actor); err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO notifications(user_id,type,title,body,actor_id,friend_group_id)
 SELECT user_id,'friend_group_message','A new message','Open your private group to read the conversation.',$2,$1
 FROM friend_group_members m JOIN users u ON u.id=m.user_id AND u.is_active WHERE m.group_id=$1 AND m.status='accepted' AND NOT m.muted AND m.user_id<>$2
 AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.friend_group_id=$1 AND n.user_id=m.user_id AND n.type='friend_group_message' AND n.read_at IS NULL)`, id, actor); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 201, map[string]bool{"ok": true})
	return nil
}

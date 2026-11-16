package outings

import (
	"github.com/jackc/pgx/v5"
	"time"
)

const groupMessageProjection = `SELECT msg.id::text,msg.request_id::text,msg.seq,COALESCE(msg.sender_id::text,'00000000-0000-4000-8000-000000000000'),COALESCE(u.username,''),COALESCE(u.avatar_url,''),msg.kind,msg.content,COALESCE(msg.event_id::text,''),COALESCE(msg.outing_id::text,''),msg.created_at,msg.outing_context,COALESCE(reference.id::text,''),
 e.id::text,COALESCE(e.title,''),COALESCE(e.banner_url,''),COALESCE(e.location_name,''),COALESCE(e.city,''),e.start_time,e.end_time,COALESCE(e.status::text,'')
 FROM friend_group_messages msg LEFT JOIN users u ON u.id=msg.sender_id LEFT JOIN events e ON e.id=msg.event_id
 JOIN friend_group_members member ON member.group_id=msg.group_id AND member.user_id=$2 AND member.status='accepted'
 LEFT JOIN LATERAL(SELECT original.id FROM friend_group_messages original WHERE original.group_id=msg.group_id AND original.outing_id=msg.outing_id AND original.event_id=msg.event_id AND original.seq>member.visible_after_seq
 ORDER BY (original.outing_context->>'referenceMessageId'=original.id::text) DESC NULLS LAST,original.seq LIMIT 1) reference ON TRUE
 WHERE msg.group_id=$1 AND msg.seq>member.visible_after_seq`

func scanGroupMessages(rows pgx.Rows) ([]groupMessage, error) {
	defer rows.Close()
	result := []groupMessage{}
	for rows.Next() {
		var m groupMessage
		var event sharedEvent
		var eventID *string
		var start, end *time.Time
		if err := rows.Scan(&m.ID, &m.RequestID, &m.Seq, &m.SenderID, &m.Username, &m.AvatarURL, &m.Kind, &m.Content, &m.EventID, &m.OutingID, &m.CreatedAt, &m.OutingContext, &m.ReferenceMessageID,
			&eventID, &event.Title, &event.ImageURL, &event.Location, &event.City, &start, &end, &event.Status); err != nil {
			return nil, err
		}
		if eventID != nil && start != nil && end != nil {
			event.ID, event.StartTime, event.EndTime = *eventID, *start, *end
			m.Event = &event
		}
		result = append(result, m)
	}
	return result, rows.Err()
}

package outings

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// The group write lock serializes explicit associations. A canonical reference
// is scoped to (group, outing, event), never to a title, photo or whole group.
// Its original sender, timestamp, content and snapshot are not rewritten.
func canonicalGroupReference(ctx context.Context, q queryer, group, outing, event pgtype.UUID) (pgtype.UUID, error) {
	var id pgtype.UUID
	err := q.QueryRow(ctx, `SELECT id FROM friend_group_messages WHERE group_id=$1 AND outing_id=$2 AND event_id=$3
 ORDER BY (outing_context->>'referenceMessageId'=id::text) DESC NULLS LAST,seq LIMIT 1`, group, outing, event).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return id, nil
	}
	return id, err
}

func bindGroupEventReference(ctx context.Context, q queryer, group, outing, event, actor pgtype.UUID, source string) error {
	var sourceID, bound pgtype.UUID
	if source != "" {
		var err error
		sourceID, err = uuid(source)
		if err != nil {
			return err
		}
		// Pending members, another group, another occurrence, and history from
		// before this membership cannot be used as a source or disclosed.
		err = q.QueryRow(ctx, `SELECT msg.outing_id FROM friend_group_messages msg JOIN friend_group_members m ON m.group_id=msg.group_id AND m.user_id=$4 AND m.status='accepted'
 WHERE msg.id=$1 AND msg.group_id=$2 AND msg.event_id=$3 AND msg.kind='event' AND msg.seq>m.visible_after_seq`, sourceID, group, event, actor).Scan(&bound)
		if errors.Is(err, pgx.ErrNoRows) {
			return missing()
		}
		if err != nil {
			return err
		}
		if bound.Valid && bound != outing {
			return conflict("SOURCE_MESSAGE_BOUND")
		}
	}
	canonical, err := canonicalGroupReference(ctx, q, group, outing, event)
	if err != nil {
		return err
	}
	if !canonical.Valid && !sourceID.Valid {
		var key pgtype.UUID
		if err = q.QueryRow(ctx, `SELECT gen_random_uuid()`).Scan(&key); err != nil {
			return err
		}
		return appendGroupMessage(ctx, q, group, actor, key, "outing", "", event, outing)
	}
	if !canonical.Valid {
		canonical = sourceID
	}
	// Pin a legacy reference before binding an older source, so canonical
	// identity remains stable even when the source has an earlier sequence.
	if _, err = q.Exec(ctx, `UPDATE friend_group_messages SET outing_context=COALESCE(outing_context,'{}'::jsonb)||jsonb_build_object('referenceMessageId',$2::text) WHERE id=$1`, canonical, sid(canonical)); err != nil {
		return err
	}
	if sourceID.Valid && !bound.Valid {
		_, err = q.Exec(ctx, `UPDATE friend_group_messages msg SET outing_id=$2,outing_context=(SELECT jsonb_strip_nulls(jsonb_build_object('decisionRound',p.decision_round,'title',p.title,'city',p.city,'outingDate',p.outing_date::text,'chosenEventId',p.chosen_event_id::text,
 'candidateDates',COALESCE((SELECT jsonb_agg(d.outing_date::text ORDER BY d.outing_date) FROM outing_plan_dates d WHERE d.plan_id=p.id),'[]'::jsonb),'referenceMessageId',$3::text)) FROM outing_plans p WHERE p.id=$2) WHERE msg.id=$1`, sourceID, outing, sid(canonical))
		if err != nil {
			return err
		}
		_, err = q.Exec(ctx, `UPDATE friend_groups SET revision=revision+1 WHERE id=$1`, group)
	}
	return err
}

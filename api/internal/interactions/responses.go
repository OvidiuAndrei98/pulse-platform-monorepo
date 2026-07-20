package interactions

import (
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
)

type CommentResponse struct {
	ID        string `json:"id"`
	EventID   string `json:"eventId"`
	UserID    string `json:"userId"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

func MapComment(c db.Comments) CommentResponse {
	return CommentResponse{
		ID:        common.UUIDToString(c.ID),
		EventID:   common.UUIDToString(c.EventID),
		UserID:    common.UUIDToString(c.UserID),
		Content:   c.Content,
		CreatedAt: common.TimestampToString(c.CreatedAt),
	}
}

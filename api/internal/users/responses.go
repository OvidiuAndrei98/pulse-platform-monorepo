package users

import (
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
)

type UserResponse struct {
	ID                string `json:"id"`
	Username          string `json:"username"`
	Email             string `json:"email"`
	Role              string `json:"role"`
	AvatarUrl         string `json:"avatarUrl,omitempty"`
	Bio               string `json:"bio,omitempty"`
	PreferredLanguage string `json:"preferredLanguage"`
	CreatedAt         string `json:"createdAt"`
}

func MapUser(u db.Users) UserResponse {
	return UserResponse{
		ID:                common.UUIDToString(u.ID),
		Username:          u.Username,
		Email:             u.Email,
		Role:              u.Role.String,
		AvatarUrl:         u.AvatarUrl.String,
		Bio:               u.Bio.String,
		PreferredLanguage: u.PreferredLanguage,
		CreatedAt:         common.TimestampToString(u.CreatedAt),
	}
}

func MapFriendsRow(u db.GetFriendsRow) UserResponse {
	return UserResponse{
		ID:        common.UUIDToString(u.ID),
		Username:  u.Username,
		Email:     u.Email,
		Role:      u.Role.String,
		AvatarUrl: u.AvatarUrl.String,
		Bio:       u.Bio.String,
		CreatedAt: common.TimestampToString(u.CreatedAt),
	}
}

func MapUpdateUserProfileRow(u db.UpdateUserProfileRow) UserResponse {
	return UserResponse{
		ID:                common.UUIDToString(u.ID),
		Username:          u.Username,
		Email:             u.Email,
		Role:              u.Role.String,
		AvatarUrl:         u.AvatarUrl.String,
		Bio:               u.Bio.String,
		PreferredLanguage: u.PreferredLanguage,
		CreatedAt:         common.TimestampToString(u.CreatedAt),
	}
}

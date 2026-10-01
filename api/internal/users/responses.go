package users

import (
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
)

type UserResponse struct {
	ID                     string `json:"id"`
	Username               string `json:"username"`
	Email                  string `json:"email"`
	Role                   string `json:"role"`
	AvatarUrl              string `json:"avatarUrl,omitempty"`
	Bio                    string `json:"bio,omitempty"`
	PreferredLanguage      string `json:"preferredLanguage"`
	ShowAttendancePublicly bool   `json:"showAttendancePublicly"`
	HasPassword            *bool  `json:"hasPassword,omitempty"`
	CreatedAt              string `json:"createdAt"`
}

func MapUser(u db.Users) UserResponse {
	return UserResponse{
		ID:                     common.UUIDToString(u.ID),
		Username:               u.Username,
		Email:                  u.Email,
		Role:                   u.Role.String,
		AvatarUrl:              u.AvatarUrl.String,
		Bio:                    u.Bio.String,
		PreferredLanguage:      u.PreferredLanguage,
		ShowAttendancePublicly: u.ShowAttendancePublicly,
		HasPassword:            boolPointer(u.PasswordHash.Valid && u.PasswordHash.String != ""),
		CreatedAt:              common.TimestampToString(u.CreatedAt),
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

func boolPointer(value bool) *bool {
	return &value
}

func MapUpdateUserProfileRow(u db.UpdateUserProfileRow) UserResponse {
	return UserResponse{
		ID:                     common.UUIDToString(u.ID),
		Username:               u.Username,
		Email:                  u.Email,
		Role:                   u.Role.String,
		AvatarUrl:              u.AvatarUrl.String,
		Bio:                    u.Bio.String,
		PreferredLanguage:      u.PreferredLanguage,
		ShowAttendancePublicly: u.ShowAttendancePublicly,
		HasPassword:            boolPointer(u.PasswordHash.Valid && u.PasswordHash.String != ""),
		CreatedAt:              common.TimestampToString(u.CreatedAt),
	}
}

package payments

import (
	"testing"
	"time"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestCheckoutRequiresRefundAfterAccountDeletion(t *testing.T) {
	t.Parallel()
	deleted := pgtype.Timestamptz{Time: time.Now(), Valid: true}
	for _, test := range []struct {
		name  string
		order db.Orders
		want  bool
	}{
		{name: "pending after delete", order: db.Orders{Status: db.OrderStatusPending, AccountOwnerDeletedAt: deleted}, want: true},
		{name: "failed retry after delete", order: db.Orders{Status: db.OrderStatusFailed, AccountOwnerDeletedAt: deleted}, want: true},
		{name: "completed before delete", order: db.Orders{Status: db.OrderStatusCompleted, AccountOwnerDeletedAt: deleted}, want: false},
		{name: "active owner", order: db.Orders{Status: db.OrderStatusPending}, want: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := checkoutRequiresRefundAfterAccountDeletion(test.order); got != test.want {
				t.Fatalf("checkoutRequiresRefundAfterAccountDeletion() = %v, want %v", got, test.want)
			}
		})
	}
}

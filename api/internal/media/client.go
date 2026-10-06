package media

import (
	"context"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"sync"
	"time"
)

var storage struct {
	sync.Mutex
	client *s3.Client
}

// Reuse transports and the SDK's refreshing credential provider. Failed initial
// setup is retryable instead of being cached forever by sync.Once.
func Client(ctx context.Context) (*s3.Client, error) {
	storage.Lock()
	defer storage.Unlock()
	if storage.client != nil {
		return storage.client, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	config, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}
	storage.client = s3.NewFromConfig(config)
	return storage.client, nil
}

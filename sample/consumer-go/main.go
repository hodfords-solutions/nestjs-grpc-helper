// Command consumer-go calls every rpc of the sample AppMicroservice through the generated Go SDK
// and prints `name -> result` for each call. A failing call is printed and the run continues.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	sdk "example.com/sample-sdk-go"
	"example.com/sample-sdk-go/pb"
)

// @GrpcId / @GrpcIds / @GrpcMetadataId values are validated as UUIDs by the sample server.
const (
	userID      = "550e8400-e29b-41d4-a716-446655440000"
	workspaceID = "3f2b8c1e-5a47-4d3e-9b6a-1c2d3e4f5a6b"
)

var relatedIDs = []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"}

func main() {
	address := "localhost:50059"
	if len(os.Args) > 1 {
		address = os.Args[1]
	}

	conn, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		fmt.Println("cannot create the gRPC client:", err)
		os.Exit(1)
	}
	defer conn.Close()

	client := sdk.NewAppMicroserviceClient(conn, sdk.WithTimeout(5*time.Second))
	ctx := context.Background()

	// Metadata is passed per call; the server reads `workspace-id` in listUsers and getWorkspaceId.
	workspace := sdk.WithMetadata(metadata.Pairs("workspace-id", workspaceID))

	// AnyDto.data is `format: 'any'`: a JSON string on the wire.
	anyParam := &pb.AnyDto{Name: "john", Data: `{"source":"consumer"}`}
	nested := &pb.ParamNestedDto{Address: "123 Main St", Type: string(sdk.UserTypeEnumStandard)}
	findMany := &pb.FindManyDto{Name: "john", NestedDto: []*pb.ParamNestedDto{{Address: "123 Main St"}}}

	failures := 0
	call := func(name string, fn func() (any, error)) {
		result, err := fn()
		if err != nil {
			failures++
			fmt.Printf("%s FAILED -> %s\n", name, describeError(err))
			return
		}
		fmt.Printf("%s -> %s\n", name, toJSON(result))
	}

	// Single object / list-of-objects responses.
	call("findOne", func() (any, error) {
		return client.FindOne(ctx, &pb.ParamDto{Name: "john", NestedDto: nested})
	})
	call("findMany", func() (any, error) { return client.FindMany(ctx, findMany) })
	call("emptyFunction", func() (any, error) { return client.EmptyFunction(ctx, findMany) })
	call("emptyParams", func() (any, error) { return client.EmptyParams(ctx) })
	call("anyDto", func() (any, error) { return client.AnyDto(ctx, anyParam) })
	call("getUsersByName", func() (any, error) { return client.GetUsersByName(ctx, anyParam) })

	// Native scalar responses, unwrapped from Native*Value.
	call("checkUserActive", func() (any, error) { return client.CheckUserActive(ctx, anyParam) })
	call("getUserDisplayName", func() (any, error) { return client.GetUserDisplayName(ctx, anyParam) })
	call("countUsers", func() (any, error) { return client.CountUsers(ctx, anyParam) })
	call("getUserRating", func() (any, error) { return client.GetUserRating(ctx, anyParam) })

	// Native list responses, unwrapped from Proto*List.
	call("getUserTags", func() (any, error) { return client.GetUserTags(ctx, anyParam) })
	call("getUserPermissions", func() (any, error) { return client.GetUserPermissions(ctx, anyParam) })
	call("getUserRolePriorities", func() (any, error) { return client.GetUserRolePriorities(ctx, anyParam) })

	// @GrpcId / @GrpcIds / @GrpcEnum parameters travel in a generated *Params message.
	call("getUserWithRelations", func() (any, error) {
		return client.GetUserWithRelations(ctx, &pb.AppMicroserviceGetUserWithRelationsParams{
			UserId:  userID,
			UserIds: relatedIDs,
		})
	})
	call("getUserByType", func() (any, error) {
		return client.GetUserByType(ctx, &pb.AppMicroserviceGetUserByTypeParams{
			UserId:   userID,
			UserType: string(sdk.UserTypeEnumAdmin),
		})
	})

	// @SdkFlattenParams is not flattened in Go: the method takes the whole ParamDto.
	call("searchUsersFlattened", func() (any, error) {
		return client.SearchUsersFlattened(ctx, &pb.ParamDto{Name: "john", NestedDto: &pb.ParamNestedDto{Address: "123 Main St"}})
	})
	call("resolveAddress", func() (any, error) {
		return client.ResolveAddress(ctx, &pb.ParamNestedDto{Address: "123 Main St"})
	})
	// Nullable primitive response: the result is not meaningful (see README).
	call("findAddressOrNull", func() (any, error) {
		return client.FindAddressOrNull(ctx, &pb.ParamNestedDto{Address: "123 Main St"})
	})

	// Nullable model response: a user for "exists", nil (and no error) otherwise.
	call("findUserByAddress(exists)", func() (any, error) {
		return client.FindUserByAddress(ctx, &pb.ParamNestedDto{Address: "exists"})
	})
	call("findUserByAddress(missing)", func() (any, error) {
		return client.FindUserByAddress(ctx, &pb.ParamNestedDto{Address: "not-found"})
	})

	// Pagination + sort + workspace-id metadata.
	call("listUsers", func() (any, error) {
		return client.ListUsers(ctx, &pb.AppMicroserviceListUsersParams{
			Body:       &pb.ParamNestedDto{Address: "123 Main St"},
			Pagination: &pb.PaginationDto{Page: 1, PerPage: 10},
			SortParam:  &pb.SortDto{SortField: "name", SortDirection: "ASC"},
		}, workspace)
	})
	call("getWorkspaceId", func() (any, error) { return client.GetWorkspaceId(ctx, workspace) })

	// On purpose: the server validates userId as a UUID and answers with a business error (code 400),
	// which the SDK returns as *sdk.Error.
	call("getUserByType(invalid userId, expected error)", func() (any, error) {
		return client.GetUserByType(ctx, &pb.AppMicroserviceGetUserByTypeParams{
			UserId:   "not-a-uuid",
			UserType: string(sdk.UserTypeEnumAdmin),
		})
	})

	fmt.Printf("Done: %d call(s) failed\n", failures)
}

// describeError shows whether err is the SDK's business error or a plain gRPC status.
func describeError(err error) string {
	var serviceErr *sdk.Error
	if errors.As(err, &serviceErr) {
		return fmt.Sprintf("*sdk.Error code=%d message=%q errors=%s", serviceErr.Code, serviceErr.Message, serviceErr.Errors)
	}
	if st, ok := status.FromError(err); ok {
		return fmt.Sprintf("gRPC status %s: %s", st.Code(), st.Message())
	}
	return err.Error()
}

func toJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%v", value)
	}
	return string(data)
}

//! Calls every rpc of the sample AppMicroservice through the generated Rust SDK and prints
//! `name -> result` for each call. A failing call is printed and the run continues.

use std::fmt::Debug;
use std::time::Duration;

use sample_sdk::enums::UserTypeEnum;
use sample_sdk::{AppMicroserviceClient, CallOptions, ClientOptions, SdkError, pb};

// @GrpcId / @GrpcIds / @GrpcMetadataId values are validated as UUIDs by the sample server.
const USER_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
const WORKSPACE_ID: &str = "3f2b8c1e-5a47-4d3e-9b6a-1c2d3e4f5a6b";
const RELATED_IDS: [&str; 2] = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
];

/// Prints one call result and counts failures.
struct Reporter {
    failures: usize,
}

impl Reporter {
    fn report<T: Debug>(&mut self, name: &str, result: Result<T, SdkError>) {
        match result {
            Ok(value) => println!("{name} -> {value:?}"),
            Err(error) => {
                self.failures += 1;
                println!("{name} FAILED -> {}", describe_error(&error));
            }
        }
    }
}

/// Shows whether the error is the SDK's business error or a plain gRPC status.
fn describe_error(error: &SdkError) -> String {
    match error {
        SdkError::Service {
            code,
            message,
            errors,
        } => format!("SdkError::Service code={code} message={message:?} errors={errors}"),
        SdkError::Status(status) => {
            format!("SdkError::Status {:?}: {}", status.code(), status.message())
        }
        SdkError::Transport(error) => format!("SdkError::Transport {error}"),
    }
}

/// Call options with no metadata.
fn plain() -> CallOptions {
    CallOptions::default()
}

/// Call options carrying the `workspace-id` metadata the server reads in listUsers and getWorkspaceId.
fn workspace() -> CallOptions {
    let mut options = CallOptions::default();
    options.metadata.insert(
        "workspace-id",
        WORKSPACE_ID.parse().expect("valid metadata value"),
    );
    options
}

fn nested(address: &str) -> pb::ParamNestedDto {
    pb::ParamNestedDto {
        address: address.to_string(),
        ..Default::default()
    }
}

#[tokio::main]
async fn main() {
    let url = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "http://localhost:50059".to_string());
    let options = ClientOptions {
        timeout: Some(Duration::from_secs(5)),
    };
    let client = match AppMicroserviceClient::connect(url, options).await {
        Ok(client) => client,
        Err(error) => {
            println!("cannot connect: {}", describe_error(&error));
            std::process::exit(1);
        }
    };

    // AnyDto.data is `format: 'any'`: a JSON string on the wire.
    let any_param = pb::AnyDto {
        name: "john".to_string(),
        data: r#"{"source":"consumer"}"#.to_string(),
    };
    let find_many = pb::FindManyDto {
        name: "john".to_string(),
        nested_dto: vec![nested("123 Main St")],
    };
    let mut r = Reporter { failures: 0 };

    // Single object / list-of-objects responses.
    let find_one = pb::ParamDto {
        name: "john".to_string(),
        nested_dto: Some(pb::ParamNestedDto {
            address: "123 Main St".to_string(),
            r#type: UserTypeEnum::Standard.as_str().to_string(),
        }),
    };
    r.report("findOne", client.find_one(find_one, plain()).await);
    r.report(
        "findMany",
        client.find_many(find_many.clone(), plain()).await,
    );
    r.report(
        "emptyFunction",
        client.empty_function(find_many, plain()).await,
    );
    r.report("emptyParams", client.empty_params(plain()).await);
    r.report("anyDto", client.any_dto(any_param.clone(), plain()).await);
    r.report(
        "getUsersByName",
        client.get_users_by_name(any_param.clone(), plain()).await,
    );

    // Native scalar responses, unwrapped from Native*Value.
    r.report(
        "checkUserActive",
        client.check_user_active(any_param.clone(), plain()).await,
    );
    r.report(
        "getUserDisplayName",
        client
            .get_user_display_name(any_param.clone(), plain())
            .await,
    );
    r.report(
        "countUsers",
        client.count_users(any_param.clone(), plain()).await,
    );
    r.report(
        "getUserRating",
        client.get_user_rating(any_param.clone(), plain()).await,
    );

    // Native list responses, unwrapped from Proto*List.
    r.report(
        "getUserTags",
        client.get_user_tags(any_param.clone(), plain()).await,
    );
    r.report(
        "getUserPermissions",
        client
            .get_user_permissions(any_param.clone(), plain())
            .await,
    );
    r.report(
        "getUserRolePriorities",
        client.get_user_role_priorities(any_param, plain()).await,
    );

    // @GrpcId / @GrpcIds / @GrpcEnum parameters travel in a generated *Params message.
    let relations = pb::AppMicroserviceGetUserWithRelationsParams {
        user_id: USER_ID.to_string(),
        user_ids: RELATED_IDS.iter().map(|id| id.to_string()).collect(),
    };
    r.report(
        "getUserWithRelations",
        client.get_user_with_relations(relations, plain()).await,
    );
    let by_type = pb::AppMicroserviceGetUserByTypeParams {
        user_id: USER_ID.to_string(),
        user_type: UserTypeEnum::Admin.as_str().to_string(),
    };
    r.report(
        "getUserByType",
        client.get_user_by_type(by_type, plain()).await,
    );

    // @SdkFlattenParams is not flattened in Rust: the method takes the whole ParamDto.
    let flattened = pb::ParamDto {
        name: "john".to_string(),
        nested_dto: Some(nested("123 Main St")),
    };
    r.report(
        "searchUsersFlattened",
        client.search_users_flattened(flattened, plain()).await,
    );
    r.report(
        "resolveAddress",
        client.resolve_address(nested("123 Main St"), plain()).await,
    );
    // Nullable primitive response: the result is not meaningful (see README).
    r.report(
        "findAddressOrNull",
        client
            .find_address_or_null(nested("123 Main St"), plain())
            .await,
    );

    // Nullable model response: Some(user) for "exists", None (and no error) otherwise.
    r.report(
        "findUserByAddress(exists)",
        client.find_user_by_address(nested("exists"), plain()).await,
    );
    r.report(
        "findUserByAddress(missing)",
        client
            .find_user_by_address(nested("not-found"), plain())
            .await,
    );

    // Pagination + sort + workspace-id metadata.
    let list_users = pb::AppMicroserviceListUsersParams {
        body: Some(nested("123 Main St")),
        pagination: Some(pb::PaginationDto {
            page: 1,
            per_page: 10,
        }),
        sort_param: Some(pb::SortDto {
            sort_field: "name".to_string(),
            sort_direction: "ASC".to_string(),
        }),
    };
    r.report(
        "listUsers",
        client.list_users(list_users, workspace()).await,
    );
    r.report("getWorkspaceId", client.get_workspace_id(workspace()).await);

    // On purpose: the server validates userId as a UUID and answers with a business error (code 400),
    // which the SDK returns as SdkError::Service.
    let invalid = pb::AppMicroserviceGetUserByTypeParams {
        user_id: "not-a-uuid".to_string(),
        user_type: UserTypeEnum::Admin.as_str().to_string(),
    };
    r.report(
        "getUserByType(invalid userId, expected error)",
        client.get_user_by_type(invalid, plain()).await,
    );

    println!("Done: {} call(s) failed", r.failures);
}

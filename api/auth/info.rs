use serde_json::json;
use vercel_runtime::{run, Body, Error, Request, Response, StatusCode};

#[tokio::main]
async fn main() -> Result<(), Error> {
    simple_logger::init_with_env().unwrap();
    run(handler).await
}

pub async fn handler(_req: Request) -> Result<Response<Body>, Error> {
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(
            json!({
              "vatsim_endpoint": std::env::var("MENAHQ_API_VATSIM_OAUTH_ENDPOINT").unwrap(),
                "client_id": std::env::var("MENAHQ_API_VATSIM_OAUTH_CLIENT_ID").unwrap()
            })
            .to_string()
            .into(),
        )?)
}

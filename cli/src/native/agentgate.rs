//! AgentGate credential and OTP client.

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialResponse {
    pub value: String,
    pub credential_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtpResponse {
    pub code: String,
    pub source: String,
    pub received_at: String,
    pub expires_at: String,
}

/// Fetch a credential from AgentGate.
///
/// POST /v1/credentials/inject { key, url } -> { value, credential_type }
pub async fn inject_credential(key: &str, url: &str) -> Result<CredentialResponse, String> {
    let base_url = env::var("AGENTGATE_API_URL")
        .map_err(|_| "AGENTGATE_API_URL environment variable not set".to_string())?;
    let api_key = env::var("AGENTGATE_API_KEY")
        .map_err(|_| "AGENTGATE_API_KEY environment variable not set".to_string())?;

    let client = reqwest::Client::new();
    let endpoint = format!("{}/v1/credentials/inject", base_url.trim_end_matches('/'));

    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&json!({ "key": key, "url": url }))
        .send()
        .await
        .map_err(|e| format!("AgentGate request failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read AgentGate response: {}", e))?;

    if !status.is_success() {
        return Err(format!("AgentGate error ({}): {}", status.as_u16(), body));
    }

    serde_json::from_str(&body).map_err(|e| format!("Invalid AgentGate response: {}", e))
}

/// Fetch the latest OTP from AgentGate.
///
/// GET /v1/otp/latest?service=xxx -> { code, source, received_at, expires_at }
pub async fn get_latest_otp(service: &str) -> Result<OtpResponse, String> {
    let base_url = env::var("AGENTGATE_API_URL")
        .map_err(|_| "AGENTGATE_API_URL environment variable not set".to_string())?;
    let api_key = env::var("AGENTGATE_API_KEY")
        .map_err(|_| "AGENTGATE_API_KEY environment variable not set".to_string())?;

    let client = reqwest::Client::new();
    let endpoint = format!("{}/v1/otp/latest", base_url.trim_end_matches('/'));

    let response = client
        .get(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .query(&[("service", service)])
        .send()
        .await
        .map_err(|e| format!("AgentGate OTP request failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read AgentGate response: {}", e))?;

    if !status.is_success() {
        return Err(format!("AgentGate error ({}): {}", status.as_u16(), body));
    }

    serde_json::from_str(&body).map_err(|e| format!("Invalid AgentGate response: {}", e))
}

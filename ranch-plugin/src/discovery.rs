//! _Local_Discovery_ (spec/adoc_hub.trm): the adoc servers of this machine, from
//! `adoc server list --output json` and each online server's `/api/workspace`.
use crate::proto::LocalHost;
use anyhow::{Context, Result, anyhow};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;

/// The `adoc` program: `ADOC_BIN`, else `PATH`, else what the user's login shell reports. herdr runs
/// plugins without the login shell, so an adoc installed by npm under nvm is usually not on `PATH`.
pub async fn find_adoc() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("ADOC_BIN").map(PathBuf::from).filter(|p| p.is_file()) {
        return Some(p);
    }
    if let Some(p) = on_path("adoc") {
        return Some(p);
    }
    login_shell_lookup().await
}

fn on_path(program: &str) -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?).map(|d| d.join(program)).find(|p| is_executable(p))
}

fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.metadata().is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

async fn login_shell_lookup() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/sh".into());
    let run = Command::new(&shell).args(["-lic", "command -v adoc"]).stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null()).kill_on_drop(true).output();
    let out = tokio::time::timeout(Duration::from_secs(10), run).await.ok()?.ok()?;
    String::from_utf8_lossy(&out.stdout).lines().rev().map(str::trim).find(|l| l.starts_with('/')).map(PathBuf::from).filter(|p| is_executable(p))
}

#[derive(Deserialize)]
struct Listed {
    workspace: String,
    url: String,
    status: String,
}

#[derive(Deserialize)]
struct Workspace {
    id: Option<String>,
    name: Option<String>,
    version: Option<String>,
    agent: Option<WorkspaceAgent>,
}
#[derive(Deserialize)]
struct WorkspaceAgent {
    claim: Option<Claim>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Claim {
    pane: Option<String>,
    herdr_session: Option<String>,
    #[serde(default)]
    gone: bool,
}

/// The servers of this machine. `adoc` runs with its own directory first on `PATH`, so that a
/// `#!/usr/bin/env node` script finds the node next to it (nvm).
pub async fn discover(adoc: &Path, http: &reqwest::Client) -> Result<Vec<LocalHost>> {
    let mut path = adoc.parent().map(|d| d.as_os_str().to_owned()).unwrap_or_default();
    if let Some(p) = std::env::var_os("PATH") {
        path.push(":");
        path.push(p);
    }
    let run = Command::new(adoc).args(["server", "list", "--output", "json"]).env("PATH", path).stdin(std::process::Stdio::null()).kill_on_drop(true).output();
    let out = tokio::time::timeout(Duration::from_secs(20), run).await.map_err(|_| anyhow!("adoc server list took longer than 20 s"))??;
    if !out.status.success() {
        return Err(anyhow!("adoc server list failed: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let listed: Vec<Listed> = serde_json::from_slice(&out.stdout).context("adoc server list --output json")?;
    let mut hosts = Vec::new();
    for l in listed {
        let Ok(url) = reqwest::Url::parse(&l.url) else { continue };
        // spec _Hub_Client_: adoc servers are reached only on loopback
        if !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1" | "[::1]")) {
            continue;
        }
        let Some(port) = url.port_or_known_default() else { continue };
        let mut host = LocalHost { workspace: l.workspace, url: l.url.trim_end_matches('/').to_string(), port, status: l.status, id: None, title: None, version: None, claim: None };
        if host.status == "online"
            && let Ok(Ok(r)) = tokio::time::timeout(Duration::from_secs(3), http.get(format!("{}/api/workspace", host.url)).send()).await
                && let Ok(w) = r.json::<Workspace>().await {
                    host.id = w.id;
                    host.title = w.name;
                    host.version = w.version;
                    host.claim = w.agent.and_then(|a| a.claim).filter(|c| !c.gone).and_then(|c| Some((c.herdr_session?, c.pane?)));
                }
        hosts.push(host);
    }
    hosts.sort_by(|a, b| a.workspace.cmp(&b.workspace));
    Ok(hosts)
}

/// The adoc workspace containing a directory: the nearest ancestor with `.adoc/adoc.yaml`.
pub fn workspace_of(dir: &Path) -> Option<PathBuf> {
    let dir = dir.canonicalize().ok()?;
    dir.ancestors().find(|d| d.join(".adoc").join("adoc.yaml").is_file()).map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn workspace_is_the_nearest_ancestor_with_adoc_yaml() {
        let root = std::env::temp_dir().join(format!("adoc-hub-ws-{}", std::process::id()));
        std::fs::create_dir_all(root.join(".adoc")).unwrap();
        std::fs::create_dir_all(root.join("docs/notes")).unwrap();
        std::fs::write(root.join(".adoc/adoc.yaml"), "plugins: {}\n").unwrap();
        assert_eq!(workspace_of(&root.join("docs/notes")), Some(root.canonicalize().unwrap()));
        assert_eq!(workspace_of(&std::env::temp_dir()), None);
        let _ = std::fs::remove_dir_all(&root);
    }
    #[test]
    fn claim_reads_adocs_shape() {
        let w: Workspace = serde_json::from_str(r#"{"id":"abc","name":"demo","version":"0.1.2","agent":{"name":"a","claim":{"pane":"w2B:p1","herdrSession":"ahq-dev","agent":"claude","status":"idle","gone":false}}}"#).unwrap();
        let c = w.agent.unwrap().claim.unwrap();
        assert_eq!((c.herdr_session.as_deref(), c.pane.as_deref(), c.gone), (Some("ahq-dev"), Some("w2B:p1"), false));
    }
}

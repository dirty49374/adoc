//! The plugin server's state in `RANCH_PLUGIN_DATA_DIR` (herdr-ranch docs/PLUGINS.md §3 item 6):
//! the host names and the approved browsers, one JSON file written atomically (write, then rename).
use crate::auth::Browser;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// A _Hub_Host_Name_, kept for a machine and a workspace path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostName {
    pub machine: String,
    pub workspace: String,
    pub name: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Stored {
    #[serde(default)]
    pub names: Vec<HostName>,
    #[serde(default)]
    pub browsers: Vec<Browser>,
}

pub fn path(dir: &Path) -> PathBuf { dir.join("state.json") }

pub fn load(dir: &Path) -> Result<Stored> {
    match std::fs::read_to_string(path(dir)) {
        Ok(text) => Ok(serde_json::from_str(&text)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Stored::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn save(dir: &Path, stored: &Stored) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join("state.json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(stored)?)?;
    std::fs::rename(&tmp, path(dir))?;
    Ok(())
}

/// Whether a name may be a _Hub_Host_Name_: lowercase letters, digits and `-`, not the form
/// `<machine>_<port>` (no `_` at all), and not a path of the hub itself.
pub fn valid_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 40 {
        return Err("a name has 1 to 40 characters".into());
    }
    if !name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') || name.starts_with('-') {
        return Err("a name is made of lowercase letters, digits and -".into());
    }
    if matches!(name, "adoc-hub" | "adoc-discovery") {
        return Err(format!("{name} is a path of the hub itself"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names() {
        assert!(valid_name("todo-app").is_ok());
        assert!(valid_name("mldev_7700").is_err());
        assert!(valid_name("Todo").is_err());
        assert!(valid_name("").is_err());
        assert!(valid_name("-x").is_err());
        assert!(valid_name("adoc-discovery").is_err());
    }
    #[test]
    fn saves_atomically_and_loads() {
        let dir = std::env::temp_dir().join(format!("adoc-hub-store-{}", std::process::id()));
        assert!(load(&dir).unwrap().names.is_empty());
        let s = Stored { names: vec![HostName { machine: "m".into(), workspace: "/w".into(), name: "w".into() }], browsers: vec![] };
        save(&dir, &s).unwrap();
        assert_eq!(load(&dir).unwrap().names, s.names);
        assert!(!dir.join("state.json.tmp").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

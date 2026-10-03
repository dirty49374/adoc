//! The herdr session this process runs in (herdr-ranch docs/PLUGINS.md §4.1): `$HERDR_SESSION`,
//! else the name in the herdr socket path (`…/sessions/<name>/herdr.sock`), else `default`.
use std::path::Path;

pub fn name() -> String {
    if let Ok(s) = std::env::var("HERDR_SESSION")
        && !s.is_empty() {
            return s;
        }
    std::env::var("HERDR_SOCKET_PATH").map(|p| of_socket(Path::new(&p))).unwrap_or_else(|_| "default".into())
}

/// `~/.config/herdr/herdr.sock` → "default"; `…/sessions/<name>/herdr.sock` → name
pub fn of_socket(p: &Path) -> String {
    let comps: Vec<String> = p.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect();
    comps.iter().position(|c| c == "sessions").and_then(|i| comps.get(i + 1)).cloned().unwrap_or_else(|| "default".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn socket_paths() {
        assert_eq!(of_socket(Path::new("/home/u/.config/herdr/herdr.sock")), "default");
        assert_eq!(of_socket(Path::new("/home/u/.config/herdr/sessions/ahq-dev/herdr.sock")), "ahq-dev");
    }
}

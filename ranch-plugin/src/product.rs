//! The names of the plugin in one place.
pub const ID: &str = "adoc-hub";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
/// the herdr pane ranch keeps open in every session (`[[panes]]` of herdr-plugin.toml)
pub const PANE: &str = "status";
/// ranch's plugin-server address for this plugin
pub fn server_address() -> String { format!("ranch://central/plugin/{ID}") }
/// the persistent client address of a session
pub fn client_address(machine: &str, session: &str) -> String { crate::ranch::client_address(ID, machine, session) }

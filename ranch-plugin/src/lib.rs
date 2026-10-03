//! adoc-hub, the herdr-ranch plugin that shows every adoc on the ranch network in one browser
//! (spec/adoc_hub.trm in the adoc repository). One binary: the plugin server, the persistent client
//! with its status pane, and the command line.
pub mod auth;
pub mod client;
pub mod discovery;
pub mod product;
pub mod proto;
pub mod ranch;
pub mod server;
pub mod session;
pub mod store;
pub mod tui;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "adoc-hub", version, about = "every adoc on the ranch network in one browser")]
pub struct Args {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// run the plugin server (ranch starts it on the central machine)
    Server,
    /// the persistent client of this herdr session
    Client {
        #[command(subcommand)]
        cmd: ClientCmd,
    },
    /// give the hub host of the adoc workspace containing this directory a name
    Name {
        /// lowercase letters, digits and -
        name: Option<String>,
        /// remove the name
        #[arg(long, conflicts_with = "name")]
        clear: bool,
    },
    /// what this session's client sees: ranch, the adoc program and the adoc servers of this machine
    Status,
}

#[derive(Subcommand)]
enum ClientCmd {
    /// run the client and draw the status screen (ranch opens it as the plugin pane)
    Run,
}

pub async fn entry() {
    let args = Args::parse();
    let result = match args.cmd {
        Cmd::Server => server::run().await,
        Cmd::Client { cmd: ClientCmd::Run } => client::run().await,
        Cmd::Name { name, clear } => client::name_command(if clear { None } else { name }, clear).await,
        Cmd::Status => client::status_command().await,
    };
    if let Err(e) = result {
        eprintln!("adoc-hub: {e:#}");
        std::process::exit(1);
    }
}

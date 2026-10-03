//! _Browser_Approval_ (spec/adoc_hub.trm), after herdr-glasses' pairing: a browser asks for a
//! short code, a person approves or rejects it on any status screen (the first answer wins), and an
//! approved browser gets a cookie whose hash alone is kept. Fail closed: without a cookie a browser
//! gets nothing but the code request.
use base64::Engine;
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use subtle::ConstantTimeEq;

pub const COOKIE: &str = "adoc_hub";
/// how long a code stays valid
pub const CODE_TTL_SECS: i64 = 180;
/// waiting requests on the whole hub
pub const MAX_PENDING: usize = 10;
/// waiting requests of one address
pub const MAX_PENDING_PER_ADDRESS: usize = 2;
/// code requests of one address within `RATE_WINDOW_SECS`
pub const RATE_LIMIT: usize = 5;
pub const RATE_WINDOW_SECS: i64 = 600;

/// 32 random bytes, base64url without padding
pub fn new_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub fn hash_token(token: &str) -> String { Sha256::digest(token.as_bytes()).iter().map(|b| format!("{b:02x}")).collect() }

/// constant-time comparison
pub fn same(a: &str, b: &str) -> bool { a.as_bytes().ct_eq(b.as_bytes()).into() }

/// The `Set-Cookie` value for an approved browser: `HttpOnly`, `SameSite=Strict`; never `Secure`,
/// since the hub is plain HTTP; the approval never expires, so the browser keeps it for ten years.
pub fn set_cookie(token: &str) -> String { format!("{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=315360000") }

/// The hub's cookie among a request's `Cookie` headers.
pub fn cookie_of<'a>(headers: impl Iterator<Item = &'a str>) -> Option<String> {
    headers.flat_map(|h| h.split(';')).find_map(|c| c.trim().strip_prefix(COOKIE).and_then(|r| r.strip_prefix('=')).map(|v| v.to_string()))
}

/// A `Cookie` header without the hub's own cookie, for passing on to a host; None when nothing is left.
pub fn without_hub_cookie(header: &str) -> Option<String> {
    let rest: Vec<&str> = header.split(';').map(str::trim).filter(|c| !c.is_empty() && !c.starts_with(&format!("{COOKIE}="))).collect();
    (!rest.is_empty()).then(|| rest.join("; "))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Browser {
    pub id: String,
    /// hex SHA-256 of the cookie; never the cookie
    pub hash: String,
    pub address: String,
    pub user_agent: String,
    pub approved_at: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct Pending {
    pub code: String,
    /// the secret the waiting page polls with; only that browser knows it
    pub secret: String,
    pub address: String,
    pub user_agent: String,
    pub expires_at: DateTime<Utc>,
}

/// What a waiting browser learns when it polls.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Waiting,
    /// the cookie, handed out once
    Approved(String),
    Rejected,
    /// expired, already collected, or never asked
    Gone,
}

#[derive(Default)]
pub struct Approvals {
    pub browsers: Vec<Browser>,
    pub pending: Vec<Pending>,
    /// decided requests whose browser has not polled yet: secret → outcome
    decided: HashMap<String, (Outcome, DateTime<Utc>)>,
    /// code requests per address, for the rate limit
    asked: HashMap<String, Vec<DateTime<Utc>>>,
}

impl Approvals {
    pub fn new(browsers: Vec<Browser>) -> Approvals { Approvals { browsers, ..Default::default() } }

    /// The approved browser of a cookie, marking it seen.
    pub fn check(&mut self, cookie: &str, now: DateTime<Utc>) -> Option<String> {
        let hash = hash_token(cookie);
        let b = self.browsers.iter_mut().find(|b| same(&b.hash, &hash))?;
        b.last_seen = now;
        Some(b.id.clone())
    }

    /// A new code for a browser, or why not.
    pub fn ask(&mut self, address: &str, user_agent: &str, now: DateTime<Utc>) -> Result<Pending, String> {
        self.expire(now);
        let times = self.asked.entry(address.to_string()).or_default();
        times.retain(|t| *t > now - Duration::seconds(RATE_WINDOW_SECS));
        if times.len() >= RATE_LIMIT {
            return Err("too many code requests from this address; try again in a few minutes".into());
        }
        if self.pending.iter().filter(|p| p.address == address).count() >= MAX_PENDING_PER_ADDRESS {
            return Err("this address already waits for approval; approve or reject that code first".into());
        }
        if self.pending.len() >= MAX_PENDING {
            return Err("too many browsers are waiting for approval; try again in a few minutes".into());
        }
        times.push(now);
        let code = loop {
            let c = format!("{:06}", rand::random::<u32>() % 1_000_000);
            if !self.pending.iter().any(|p| p.code == c) {
                break c;
            }
        };
        let user_agent: String = user_agent.chars().take(200).collect();
        let p = Pending { code, secret: new_token(), address: address.to_string(), user_agent, expires_at: now + Duration::seconds(CODE_TTL_SECS) };
        self.pending.push(p.clone());
        Ok(p)
    }

    /// The first answer decides; a later one, or one for an unknown code, is refused.
    pub fn decide(&mut self, code: &str, approve: bool, now: DateTime<Utc>) -> Result<Option<Browser>, String> {
        self.expire(now);
        let i = self.pending.iter().position(|p| p.code == code).ok_or_else(|| format!("no waiting browser has code {code}"))?;
        let p = self.pending.remove(i);
        if !approve {
            self.decided.insert(p.secret, (Outcome::Rejected, now));
            return Ok(None);
        }
        let cookie = new_token();
        let hash = hash_token(&cookie);
        let b = Browser { id: hash[..12].to_string(), hash, address: p.address, user_agent: p.user_agent, approved_at: now, last_seen: now };
        self.browsers.push(b.clone());
        self.decided.insert(p.secret, (Outcome::Approved(cookie), now));
        Ok(Some(b))
    }

    /// What the browser holding `secret` gets; an approval's cookie is handed out once.
    pub fn poll(&mut self, secret: &str, now: DateTime<Utc>) -> Outcome {
        self.expire(now);
        if self.pending.iter().any(|p| same(&p.secret, secret)) {
            return Outcome::Waiting;
        }
        let key = self.decided.keys().find(|k| same(k, secret)).cloned();
        key.and_then(|k| self.decided.remove(&k)).map(|(o, _)| o).unwrap_or(Outcome::Gone)
    }

    pub fn revoke(&mut self, id: &str) -> Option<Browser> {
        let i = self.browsers.iter().position(|b| b.id == id)?;
        Some(self.browsers.remove(i))
    }

    /// Drops expired codes and outcomes nobody collected; true when a waiting request went away.
    pub fn expire(&mut self, now: DateTime<Utc>) -> bool {
        let before = self.pending.len();
        self.pending.retain(|p| p.expires_at > now);
        self.decided.retain(|_, (_, at)| *at > now - Duration::seconds(CODE_TTL_SECS));
        self.pending.len() != before
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approve_hands_out_a_cookie_once_and_keeps_only_its_hash() {
        let now = Utc::now();
        let mut a = Approvals::default();
        let p = a.ask("10.0.0.5", "Firefox", now).unwrap();
        assert_eq!(p.code.len(), 6);
        assert_eq!(a.poll(&p.secret, now), Outcome::Waiting);
        let b = a.decide(&p.code, true, now).unwrap().unwrap();
        let Outcome::Approved(cookie) = a.poll(&p.secret, now) else { panic!() };
        assert_eq!(a.poll(&p.secret, now), Outcome::Gone, "the cookie is handed out once");
        assert_ne!(b.hash, cookie);
        assert_eq!(a.check(&cookie, now), Some(b.id.clone()));
        assert!(a.decide(&p.code, false, now).is_err(), "a second answer is refused");
        a.revoke(&b.id).unwrap();
        assert_eq!(a.check(&cookie, now), None, "revoked at once");
    }

    #[test]
    fn rejected_expired_and_unknown() {
        let now = Utc::now();
        let mut a = Approvals::default();
        let p = a.ask("x", "ua", now).unwrap();
        a.decide(&p.code, false, now).unwrap();
        assert_eq!(a.poll(&p.secret, now), Outcome::Rejected);
        let q = a.ask("x", "ua", now).unwrap();
        assert!(a.expire(now + Duration::seconds(CODE_TTL_SECS + 1)));
        assert_eq!(a.poll(&q.secret, now + Duration::seconds(CODE_TTL_SECS + 1)), Outcome::Gone);
        assert!(a.decide(&q.code, true, now + Duration::seconds(CODE_TTL_SECS + 1)).is_err());
        assert_eq!(a.poll("made-up", now), Outcome::Gone);
    }

    #[test]
    fn rate_limited_per_address_and_capped_overall() {
        let now = Utc::now();
        let mut a = Approvals::default();
        for _ in 0..RATE_LIMIT {
            let p = a.ask("1.1.1.1", "ua", now).unwrap();
            a.decide(&p.code, false, now).unwrap();
        }
        assert!(a.ask("1.1.1.1", "ua", now).is_err());
        assert!(a.ask("1.1.1.1", "ua", now + Duration::seconds(RATE_WINDOW_SECS + 1)).is_ok(), "the window moves on");
        let mut c = Approvals::default();
        for _ in 0..MAX_PENDING_PER_ADDRESS {
            c.ask("2.2.2.2", "ua", now).unwrap();
        }
        assert!(c.ask("2.2.2.2", "ua", now).is_err(), "waiting codes are capped per address");
        let mut b = Approvals::default();
        for i in 0..MAX_PENDING {
            b.ask(&format!("10.0.0.{i}"), "ua", now).unwrap();
        }
        assert!(b.ask("10.0.0.99", "ua", now).is_err());
    }

    #[test]
    fn cookies() {
        assert_eq!(cookie_of(["a=1; adoc_hub=tok; b=2"].into_iter()), Some("tok".into()));
        assert_eq!(cookie_of(["adoc_hubx=1"].into_iter()), None);
        assert_eq!(without_hub_cookie("a=1; adoc_hub=tok; b=2").as_deref(), Some("a=1; b=2"));
        assert_eq!(without_hub_cookie("adoc_hub=tok"), None);
        let c = set_cookie("t");
        assert!(c.contains("HttpOnly") && c.contains("SameSite=Strict") && !c.contains("Secure"));
    }
}

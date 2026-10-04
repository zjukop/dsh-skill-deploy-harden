---
name: deploy-harden
description: Guide deploying an AI agent / web service to a cloud VM and hardening it against the failures that actually bite: an unauthenticated service with a web shell exposed to the internet, leaked cookies/keys in logs, an agent run amok with a destructive command, a token budget blown overnight, a disk filling up, or a chargeback with no audit trail. Use when the user is about to expose a service publicly, self-host an AI gateway, put a tool behind a public URL, run agents on a schedule, or ship something that handles money. Pure guidance + checklists; no code, no server access.
whenToUse: The user says "deploy this to the cloud / put it on a public URL / make it accessible", "expose port X", "set up an API gateway / sub2api / one-api", "run this agent on cron unattended", "my agent might run rm -rf / drop table / git push --force", "how do I stop the token bill from exploding", "someone might chargeback / refund", or "is this safe to put on the internet". Also use before any `dsh plugin add` or `pm2 start` that runs host code outside the sandbox.
---

# Deploy + security hardening for self-hosted AI services

This skill is a **guidance + checklist** package. It tells you how to put an AI agent or web service on a cloud VM and how to harden it against the handful of failures that actually hurt people who self-host. It does **not** run commands for you, does **not** touch your cloud account, and does **not** hold your keys. You bring the server, the secrets, and the judgment.

It is distilled from real deployments that lost time to exactly these mistakes — and from the one rule that prevents most of them: **a service that has no auth and ships a web shell, exposed to the public internet, is a root shell for everyone.**

## What this skill can and cannot do

**Can:** give you a go/no-go deploy checklist; tell you which ports may be public and which must never be; explain the one-key unified gateway pattern; give you a destructive-command guard pattern with an audit trail; give you a token/disk budget-circuit-breaker pattern; give you a secret-redaction pattern for logs and webhook pushes; give you an anti-chargeback audit-trail pattern.

**Cannot:** configure your firewall for you, pick your cloud provider's SKU, hold your secrets, or make an insecure-by-design service safe. If your service is "no auth + web terminal", the only safe answer is "don't expose it publicly" — no checklist changes that.

## The one rule that prevents most disasters

A self-hosted service that (a) has **no authentication** and (b) ships a **web terminal / web shell** (e.g. `node-pty`, a full in-browser terminal), if you expose it on a public port, is a **root shell for the entire internet**. There is no "read-only" workaround; a terminal is a terminal.

Concretely: services like a self-hostable "personal OS" or agent dashboard frequently default to **no auth** and bundle a web terminal. Putting their admin ports (typical ranges like `5553–5561`, or any port serving the terminal) on `0.0.0.0` is the single most dangerous deployment mistake in this category.

**Mandatory for any such service:**
- Bind it to `127.0.0.1` only, **or** put it behind a private mesh (Tailscale/WireGuard/Nebula) and never publish the admin port.
- Access it only over an SSH tunnel or the private mesh.
- Never open the admin/terminal port in the cloud security group / firewall.

If you cannot do the above, do not deploy that service publicly. This is a hard stop, not a preference.

## Deploy go/no-go checklist

Before any `pm2 start` / `docker run` / `dsh plugin add` that runs host code, confirm:

- [ ] **Port map written down.** A table: port → service → `public` | `private`. Admin, DB, Redis, terminal, gateway-admin, metrics ports default to `private`.
- [ ] **No admin/terminal port is `0.0.0.0`.** Cloud security group / `ufw` / security-list rules closed for those ports.
- [ ] **Secrets out of git.** `.env` is gitignored and *not* committed. Tokens/keys are in the env or a secret store, never literals in code.
- [ ] **Disk headroom known.** Root partition has a buffer; a "disk-full circuit breaker" (below) is in place if the service writes logs/caches.
- [ ] **Budget ceiling set.** If the service calls an LLM, a daily token-cost ceiling + circuit breaker exists before the first cron run.
- [ ] **Resource sizing honest.** A pure "API-orchestration shell" (LLM calls go to a remote API) needs only CPU+RAM, **no GPU** — do not rent a GPU box for it. GPU is only for local model inference / media generation.
- [ ] **Cost discipline.** During a zero-revenue period, do not rent new infra to "scale"; reuse sunk-cost boxes. Do not spend on a server before the service has earned a cent.
- [ ] **One purpose per box where possible.** A 1.8 GB-RAM box is a light worker, not a Postgres+Langfuse+Node host. Match the load to the box.

## Sizing honesty (don't rent the wrong box)

| Need | Box | Why |
|---|---|---|
| Orchestrator + cron workers calling remote LLM APIs | 8 vCPU / 16–32 GB RAM / 100 GB disk, **no GPU** | The box only orchestrates; inference is remote. Renting a GPU here is pure waste. |
| Local LLM inference, image/video generation | GPU box (e.g. a single 24 GB card) | Only when you actually run models locally. |

If you already have free compute (a personal GPU box) coming back in days, **wait** — renting a temporary GPU during the gap is waste. If you must bridge, rent the cheapest A-tier CPU box, not a GPU.

## The unified gateway pattern (one key, one endpoint)

Bring every token (every domestic and foreign model key) behind **one** OpenAI-compatible endpoint that listens on `127.0.0.1:8080` and exposes `/v1/chat/completions` + `/v1/models`. Reference implementations: `one-api` / `new-api` (most mature aggregators), `LiteLLM`, or a self-hosted proxy. The upper orchestration layer then knows **only one key**.

**Model routing (the actual cost moat):** use the cheapest model that does 80% of the work; reserve the strong/expensive model for the key judgment step only. A multi-model gateway makes this one line of routing config — that is the whole point of unifying.

**Never** put the gateway's admin UI or its raw key on a public port. The `/v1/*` inference path may be public (behind auth + rate limit); the admin UI and the upstream keys are private.

## Secret redaction (cookies, keys, tokens in logs)

Any line you log, print, or push to a webhook (Feishu/Discord/Slack) must pass through redaction first. Pattern: define a set of regexes that match your secret shapes and replace with `***` before the string leaves the process.

```
REDACT = [
  (sk-[A-Za-z0-9_-]{16,})            -> "sk-***",       # OpenAI-style keys
  ([A-Za-z0-9_-]{32,})  when it looks like a token       # generic long opaque tokens
  (Bearer\s+[A-Za-z0-9._-]+)        -> "Bearer ***",
  (cookie:\s*[^\s;]+)               -> "cookie: ***",  # Cookie headers
  (secrets?["']?\s*[:=]\s*["']?[A-Za-z0-9_/-]{8,}) -> "secret=***",
]
```
Apply before: writing a log line, sending a webhook payload, echoing a request body, or `print()`-debugging. The failure mode this prevents: you push a "daily digest" to a Feishu webhook and it contains the `Authorization: Bearer sk-...` header you logged by accident. Redact-by-default, not redact-on-recall.

## Destructive-command guard (the agent-run-amok problem)

An unattended agent (cron, a loop, an autonomous harness) that can run shell/SQL/git commands will, eventually, run a destructive one. The guard is a **pre-flight gate** with three parts: match → confirm (in unattended runs: require an explicit allow-list/dry-run) → log to an immutable audit trail.

**Destructive pattern set (block by default):**
```
rm\s+-rf?\s+(/|~|\*|\$HOME|\.\.)        # rm -rf on root/home/glob/parent
DROP\s+(TABLE|DATABASE|SCHEMA)           # SQL DROP
DELETE\s+FROM\s+\w+\s*(?!.*WHERE)        # DELETE without WHERE
git\s+push\s+(-f|--force|.*--no-verify)  # force push
git\s+reset\s+--hard                      # hard reset
docker\s+(rm|rmi|stop)\s+(-f|--force)    # force-removing containers
:\(\)\{\s*:\|:&\s*\};:                    # fork bomb
chmod\s+-R\s+0?777\s+/(etc|usr|var)?     # recursive 777 on system dirs
```
**Gate behavior:**
- **Interactive run:** the guard blocks and asks for explicit human confirmation; shows the exact command, the target path, and what would be deleted.
- **Unattended/cron run:** destructive commands are **rejected outright** unless the command is on a pre-declared allow-list AND a dry-run was executed first. Never let a cron agent `rm -rf` something it guessed.
- **Audit trail (留痕):** every destructive command that is allowed writes a line to an append-only, date-stamped log: `timestamp | actor | command | target | dry-run-result | approved-by`. This log is the thing you show when something goes wrong — and the thing that deters careless approvals.

For SQL, the same idea: require a `WHERE` with a `LIMIT` on `DELETE`/`UPDATE` in production; reject table-wide mutations from automated jobs.

## Budget circuit breakers (token cost + disk full)

Two circuit breakers, both **fail-closed** (stop, don't degrade):

**Token-cost ceiling.** For every LLM call, record `tokens × unit_price`. Accumulate per day. When the daily sum crosses the ceiling (e.g. a self-set `¥1000/day`), the breaker trips: all auto-loops stop; only manual one-shot calls proceed until the next day. This requires a price table per model in your gateway — fill it honestly; an unmapped model counts as `price=0` and silently bypasses the ceiling, which is worse than no ceiling.

**Disk-full breaker.** Check root/partition usage before each write-heavy cron tick; when usage crosses (e.g. 85%), stop writes and alert. A logging/caching service with no disk breaker will, eventually, fill the disk and take down everything co-located on that box — Postgres included.

Both breakers log the trip to the audit trail and notify a human; neither silently self-heals, because silent self-healing hides the underlying leak.

## Anti-chargeback / refund audit trail (防退款留痕)

For any service that takes money (paid API, SaaS, affiliate payouts, paid content), keep an **immutable, timestamped, actor-attributed** record of every money-touching event: order id, amount, actor (user + system), action (charge/refund/fulfill/payout), timestamp, and a content/receipt hash. Append-only; never editable. This trail is what you show a payment processor when a customer chargesbacks a fulfilled order, and its mere existence (fast, specific evidence) materially raises the bar for a fraudulent refund. Pair it with: receipts stored at fulfillment time, and a "no fulfillment record → cannot refund" rule in your refund path.

## Cron / worker hygiene

- Each worker in its own venv / project dir, its own `.env`, its own `log/` dir. No shared mutable state between workers.
- Stagger schedules — don't fire five HTTP-heavy workers on the minute; offset by minutes to stay under rate limits and to make logs readable.
- Every cron run writes `log/YYYY-MM-DD-<worker>.md`; failures push a one-line alert to a webhook; silent failures are the actual bug.
- An agent's output is a **hypothesis**, not a conclusion — a human reviews before it becomes an action that costs money or runs a destructive command (ties back to the guard above).

## Compliance honesty

Do not self-build a cross-border VPN to reach foreign model APIs from a domestic box: it is (a) a regulatory risk, (b) likely to get the IDC IP flagged/banned by the provider, (c) a terms violation for shared/student accounts, and (d) often pointless because the provider's anti-fraud targets exactly resold-shared-subscription traffic. The honest path: use official domestic API models for automated loops; reserve foreign models for manual, key-judgment steps under their real terms. This skill never coaches circumventing a provider's terms.

## Honest limits

- This skill tells you **what** to check and **why**; it does not SSH into your box and does it for you. You still have to run the firewall/`ufw`/security-group commands.
- It cannot make an insecure-by-design service safe. If the service is "no auth + web terminal", the only safe configuration is "not public".
- Sizing guidance is a rubric, not a quote — verify live prices on your provider's calculator before you rent.
- The destructive-command pattern set is a default denylist, not a complete one. Extend it for your stack (e.g. `kubectl delete namespace`, `terraform destroy`).

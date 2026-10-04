# dsh-skill-deploy-harden

> A **DeepSeek Harness skill** that guides you through putting an AI agent / web service on a cloud VM — and hardening it against the failures that actually bite.

[简体中文](#简体中文) · [English](#english)

---

<a id="english"></a>
## What it is

`dsh-skill-deploy-harden` is a pure-guidance skill for [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh). It covers the deploy-and-harden loop end to end, distilled from real self-hosted deployments:

- The one rule that prevents most disasters: **an unauthenticated service with a web shell, exposed publicly, is a root shell for everyone.**
- Deploy go/no-go checklist (port map, secrets, disk, budget, sizing, cost discipline).
- Sizing honesty: a pure API-orchestration shell needs CPU, **not GPU**.
- The unified gateway pattern (one key, one `127.0.0.1:8080` endpoint, model routing by cost).
- Secret redaction before any log/webhook push.
- Destructive-command guard with an immutable audit trail (the agent-run-amok problem).
- Token-cost + disk-full circuit breakers (fail-closed).
- Anti-chargeback / refund audit trail.
- Cron/worker hygiene + compliance honesty (no self-built cross-border VPN).

What it does **not** do: run commands on your box, hold your secrets, or make an insecure-by-design service safe.

## Install (zero-code skill)

DSH discovers skills from the filesystem skill roots (`~/.dsh/skills/`, `<project>/.dsh/skills/`, `~/.agents/skills/`), one level deep: `<root>/<name>/SKILL.md`. The bundled installer links `SKILL.md` into `~/.dsh/skills/deploy-harden/`:

```sh
npx dsh-skill-deploy-harden            # one command (recommended)
# or
npm i -g dsh-skill-deploy-harden && dsh-skill-deploy-harden
# or manual
mkdir -p ~/.dsh/skills/deploy-harden && cp SKILL.md ~/.dsh/skills/deploy-harden/SKILL.md
```

Restart DSH (or let its watcher pick it up). The skill `deploy-harden` appears in the catalog; the model loads it on demand.

> `dsh plugin add` installs Cordis **bundles** (code plugins). A zero-code skill has no bundle, so it loads via the skill filesystem provider — which is what the linker above does.

## Usage

In a DSH conversation, describe the deploy/security situation; the catalog's "Use when…" routes this skill automatically:

- "把这个服务部署到云上,怎么安全暴露端口?"
- "我的 agent 要跑 cron,怎么防止它 rm -rf / 或 DROP TABLE?"
- "搭一个 sub2api / one-api 网关,一个 key 统领所有模型"
- "token 账单怎么防止一夜爆掉?磁盘满了怎么熔断?"
- "这服务带 web 终端,能直接放公网吗?" (the skill will tell you: no.)

## Example guard pattern

```
Destructive denylist (default-block):
  rm -rf (/|~|*|$HOME|..)
  DROP (TABLE|DATABASE|SCHEMA)
  DELETE FROM <t> without WHERE
  git push --force / git reset --hard
  docker rm -f / docker stop -f
  fork bomb / chmod -R 777 on system dirs

Gate:
  interactive  → block + ask human, show target + what deletes
  unattended   → reject unless allow-listed AND dry-run passed
  audit trail  → append: timestamp | actor | cmd | target | dry-run | approved-by
```

## Data & security boundary

- The skill is prose + checklists. It never touches your cloud account, firewall, or secrets.
- It tells you to **bind admin/terminal ports to `127.0.0.1`** and access over SSH/private mesh — it does not (and cannot) do that binding for you.
- It never coaches bypassing a provider's terms (no self-built cross-border VPN for foreign model APIs).

## License

MIT.

---

<a id="简体中文"></a>
## 这是什么

`dsh-skill-deploy-harden` 是 [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh) 的纯指导 skill,覆盖"部署到云 + 安全加固"全流程,蒸馏自真实自建部署的实战教训:

- 一条铁律:无鉴权 + 带 web 终端的服务,放公网 = 给全网一个 root shell。
- 部署 go/no-go 清单(端口图、密钥、磁盘、预算、选型、成本铁律)。
- 选型诚实:纯 API 编排壳只要 CPU,不要 GPU。
- 统一网关(一个 key、`127.0.0.1:8080`、按成本路由模型)。
- 日志/webhook 推送前先脱敏 cookie/密钥。
- 破坏性命令护栏 + 不可变审计留痕(agent 失控问题)。
- token 成本 + 磁盘满双熔断(fail-closed)。
- 防退款审计留痕。
- cron/worker 卫生 + 合规诚实(不建跨境 VPN)。

**不给**你:替你跑命令、替你保管密钥、把"无鉴权+web终端"的服务变成安全。

## 安装(零代码 skill)

DSH 从文件系统 skill 根(`~/.dsh/skills/`、`<项目>/.dsh/skills/`、`~/.agents/skills/`)一层深发现 `<root>/<name>/SKILL.md`。本包带一键安装器:

```sh
npx dsh-skill-deploy-harden          # 推荐:一键链接
# 或
npm i -g dsh-skill-deploy-harden && dsh-skill-deploy-harden
# 或手动
mkdir -p ~/.dsh/skills/deploy-harden && cp SKILL.md ~/.dsh/skills/deploy-harden/SKILL.md
```

链好后重启 DSH,`deploy-harden` 出现在目录里,模型按需加载。

> `dsh plugin add` 装的是 bundle(代码插件);零代码 skill 走 skill 文件系统 provider,用上面的链接器。

## 用法

在 DSH 对话里直接描述部署/安全场景,目录里的 "Use when…" 会自动路由:

- "把这个服务部署到云上,怎么安全暴露端口?"
- "我的 agent 要跑 cron,怎么防止它 rm -rf / 或 DROP TABLE?"
- "搭一个 sub2api / one-api 网关,一个 key 统领所有模型"
- "token 账单怎么防止一夜爆掉?"
- "这服务带 web 终端,能直接放公网吗?"(skill 会答:不能。)

## License

MIT。
